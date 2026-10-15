use crate::models::DiskMetric;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub const REFRESH_SECONDS: i64 = 24 * 60 * 60;
pub const RETRY_SECONDS: i64 = 30 * 60;
pub const ROUND_SECONDS: u64 = 60 * 60;

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MountScanStatus {
    Pending,
    Scanning,
    Success,
    Timeout,
    PermissionDenied,
    ConnectionFailed,
    Unrecognized,
    Duplicate,
    Failed,
    Busy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountScan {
    pub mount_point: String,
    pub status: MountScanStatus,
    pub result: Option<DiskMetric>,
    pub collected_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskScanState {
    pub server_id: String,
    pub queued: bool,
    pub running: bool,
    pub last_attempt_at: i64,
    pub next_refresh_at: i64,
    pub retry_at: Option<i64>,
    pub mounts: Vec<MountScan>,
}

impl DiskScanState {
    pub fn new(server_id: &str) -> Self {
        Self {
            server_id: server_id.into(),
            queued: false,
            running: false,
            last_attempt_at: 0,
            next_refresh_at: 0,
            retry_at: None,
            mounts: vec![],
        }
    }

    pub fn prepare(&mut self, mounts: &[String], now: i64, force: bool) -> Vec<String> {
        if self.queued || self.running {
            return vec![];
        }
        if !force && self.retry_at.is_some_and(|retry| now < retry) {
            return vec![];
        }
        let full = force || now >= self.next_refresh_at;
        if !full && self.retry_at.is_none_or(|retry| now < retry) {
            return vec![];
        }
        for mount in mounts {
            if !self.mounts.iter().any(|entry| &entry.mount_point == mount) {
                self.mounts.push(MountScan {
                    mount_point: mount.clone(),
                    status: MountScanStatus::Pending,
                    result: None,
                    collected_at: None,
                });
            }
        }
        // Incomplete mounts go first, including during a manual/full refresh.
        self.mounts
            .sort_by_key(|entry| entry.status == MountScanStatus::Success);
        let mut selected = vec![];
        for entry in &mut self.mounts {
            if mounts.contains(&entry.mount_point)
                && (full || entry.status != MountScanStatus::Success)
            {
                selected.push(entry.mount_point.clone());
                entry.status = MountScanStatus::Pending;
            }
        }
        if !selected.is_empty() {
            self.last_attempt_at = now;
            if full {
                self.next_refresh_at = now + REFRESH_SECONDS;
            }
            self.retry_at = None;
            self.queued = true;
        }
        selected
    }

    pub fn apply(&mut self, update: MountScan) {
        if let Some(entry) = self
            .mounts
            .iter_mut()
            .find(|entry| entry.mount_point == update.mount_point)
        {
            entry.status = update.status;
            if let Some(result) = update.result {
                entry.result = Some(result);
                entry.collected_at = update.collected_at;
            }
        }
    }

    pub fn finish(&mut self, unfinished_status: MountScanStatus, now: i64) {
        self.queued = false;
        self.running = false;
        for entry in &mut self.mounts {
            if matches!(
                entry.status,
                MountScanStatus::Pending | MountScanStatus::Scanning
            ) {
                entry.status = unfinished_status.clone();
            }
        }
        self.retry_at = self
            .mounts
            .iter()
            .any(|entry| entry.status != MountScanStatus::Success)
            .then_some(now + RETRY_SECONDS);
    }
}

pub struct DiskScanManager {
    active: Arc<Mutex<HashSet<String>>>,
    slots: Arc<Semaphore>,
}

impl Default for DiskScanManager {
    fn default() -> Self {
        Self {
            active: Arc::default(),
            slots: Arc::new(Semaphore::new(2)),
        }
    }
}

impl DiskScanManager {
    pub fn reserve(&self, server_id: &str) -> Result<Option<ScanReservation>, String> {
        let mut active = self.active.lock().map_err(|error| error.to_string())?;
        if !active.insert(server_id.into()) {
            return Ok(None);
        }
        Ok(Some(ScanReservation {
            server_id: server_id.into(),
            active: self.active.clone(),
            slots: self.slots.clone(),
        }))
    }
}

pub struct ScanReservation {
    server_id: String,
    active: Arc<Mutex<HashSet<String>>>,
    slots: Arc<Semaphore>,
}

impl ScanReservation {
    pub async fn acquire(&self) -> Result<OwnedSemaphorePermit, String> {
        self.slots
            .clone()
            .acquire_owned()
            .await
            .map_err(|error| error.to_string())
    }
}

impl Drop for ScanReservation {
    fn drop(&mut self) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(&self.server_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_only_incomplete_mounts_and_manual_refresh_resets_daily_deadline() {
        let mut state = DiskScanState::new("one");
        let mounts = vec!["/data".into(), "/slow".into()];
        assert_eq!(state.prepare(&mounts, 100, false), mounts);
        state.mounts[0].status = MountScanStatus::Success;
        state.finish(MountScanStatus::Timeout, 200);
        assert!(state
            .prepare(&mounts, 200 + RETRY_SECONDS - 1, false)
            .is_empty());
        assert_eq!(
            state.prepare(&mounts, 200 + RETRY_SECONDS, false),
            vec!["/slow"]
        );
        assert_eq!(state.next_refresh_at, 100 + REFRESH_SECONDS);
        state.finish(MountScanStatus::Timeout, 2100);
        assert_eq!(state.prepare(&mounts, 2101, true), vec!["/slow", "/data"]);
        assert_eq!(state.next_refresh_at, 2101 + REFRESH_SECONDS);
        assert!(state.prepare(&mounts, 2200, true).is_empty());
    }

    #[test]
    fn failures_keep_the_last_successful_pair_and_timestamp() {
        let mut state = DiskScanState::new("one");
        state.prepare(&["/data".into()], 100, false);
        state.apply(MountScan {
            mount_point: "/data".into(),
            status: MountScanStatus::Success,
            result: Some(DiskMetric {
                mount_point: "/data".into(),
                used_bytes: 50,
                total_bytes: 100,
                available_bytes: 50,
                current_user_used_bytes: Some(20),
            }),
            collected_at: Some(110),
        });
        state.finish(MountScanStatus::Failed, 111);
        assert!(state.prepare(&["/data".into()], 120, false).is_empty());
        state.prepare(&["/data".into()], 120, true);
        state.apply(MountScan {
            mount_point: "/data".into(),
            status: MountScanStatus::PermissionDenied,
            result: None,
            collected_at: None,
        });
        state.finish(MountScanStatus::Failed, 121);
        assert_eq!(state.mounts[0].result.as_ref().unwrap().used_bytes, 50);
        assert_eq!(
            state.mounts[0]
                .result
                .as_ref()
                .unwrap()
                .current_user_used_bytes,
            Some(20)
        );
        assert_eq!(state.mounts[0].collected_at, Some(110));
    }

    #[test]
    fn daily_deadline_does_not_bypass_failure_cooldown() {
        let mut state = DiskScanState::new("one");
        let mounts = ["/data".into()];
        state.prepare(&mounts, 100, false);
        state.finish(MountScanStatus::Timeout, 100 + REFRESH_SECONDS);
        assert!(state
            .prepare(&mounts, 101 + REFRESH_SECONDS, false)
            .is_empty());
        assert_eq!(state.prepare(&mounts, 102 + REFRESH_SECONDS, true), mounts);
    }

    #[test]
    fn missing_mount_in_fast_df_does_not_discard_its_cached_pair() {
        let mut state = DiskScanState::new("one");
        state.prepare(&["/data".into()], 100, false);
        state.mounts[0].status = MountScanStatus::Success;
        state.mounts[0].collected_at = Some(110);
        state.finish(MountScanStatus::Failed, 111);
        assert_eq!(state.prepare(&["/local".into()], 120, true), vec!["/local"]);
        assert_eq!(
            state
                .mounts
                .iter()
                .find(|entry| entry.mount_point == "/data")
                .unwrap()
                .collected_at,
            Some(110)
        );
    }

    #[tokio::test]
    async fn reserves_one_round_per_server_and_at_most_two_active_servers() {
        let manager = DiskScanManager::default();
        let first = manager.reserve("one").unwrap().unwrap();
        assert!(manager.reserve("one").unwrap().is_none());
        let second = manager.reserve("two").unwrap().unwrap();
        let third = manager.reserve("three").unwrap().unwrap();
        let first_slot = first.acquire().await.unwrap();
        let _second_slot = second.acquire().await.unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), third.acquire())
                .await
                .is_err()
        );
        drop(first_slot);
        let _third_slot = third.acquire().await.unwrap();
        drop(first);
        assert!(manager.reserve("one").unwrap().is_some());
    }
}

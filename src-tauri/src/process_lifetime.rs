//! Process lifetime containment for child processes started by RackTop.
//!
//! Windows does not automatically terminate descendants when a GUI process
//! exits. A Job Object with KILL_ON_JOB_CLOSE gives every SSH descendant the
//! same lifetime as RackTop, including abnormal process termination.

#[cfg(target_os = "windows")]
mod windows {
    use std::{
        ptr::null_mut,
        sync::{Mutex, MutexGuard, OnceLock},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, HANDLE},
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JobObjectExtendedLimitInformation, SetInformationJobObject,
            },
            Threading::GetCurrentProcess,
        },
    };

    static JOB: OnceLock<JobHandle> = OnceLock::new();

    static UPDATE_HANDOFF: Mutex<()> = Mutex::new(());

    struct JobHandle(HANDLE);

    unsafe impl Send for JobHandle {}
    unsafe impl Sync for JobHandle {}

    impl Drop for JobHandle {
        fn drop(&mut self) {
            // The OS closes the job handle during process teardown too; this
            // explicit close is mainly for tests and orderly shutdown.
            unsafe { CloseHandle(self.0) };
        }
    }

    pub fn install() -> Result<(), String> {
        if JOB.get().is_some() {
            return Ok(());
        }

        let job = unsafe { CreateJobObjectW(null_mut(), null_mut()) };
        if job.is_null() {
            return Err(format!(
                "无法创建 Windows 子进程作业对象：错误 {}",
                unsafe { GetLastError() }
            ));
        }

        if let Err(error) = set_limits(job, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) {
            unsafe { CloseHandle(job) };
            return Err(error);
        }

        // A process already attached to a restrictive parent Job may reject
        // nesting. In that case the app remains usable, but reports the
        // limitation instead of claiming orphan cleanup is active.
        let assigned = unsafe { AssignProcessToJobObject(job, GetCurrentProcess()) };
        if assigned == 0 {
            let error = unsafe { GetLastError() };
            unsafe { CloseHandle(job) };
            return Err(format!("无法接管 Windows 子进程生命周期：错误 {error}"));
        }

        JOB.set(JobHandle(job))
            .map_err(|_| "Windows 子进程作业对象重复初始化".to_string())
    }

    fn set_limits(job: HANDLE, flags: u32) -> Result<(), String> {
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = flags;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            return Err(format!(
                "无法配置 Windows 子进程作业对象：错误 {}",
                unsafe { GetLastError() }
            ));
        }
        Ok(())
    }

    pub struct InstallerHandoff {
        job: Option<HANDLE>,
        _lock: MutexGuard<'static, ()>,
    }

    // Only call after the updater has downloaded and verified the package.
    // Existing SSH descendants stay in the job and are still killed on exit.
    // New installer descendants must survive the updater's std::process::exit.
    pub fn installer_handoff() -> Result<InstallerHandoff, String> {
        let lock = UPDATE_HANDOFF
            .try_lock()
            .map_err(|_| "已有更新正在安装".to_string())?;
        let job = JOB.get().map(|job| job.0);
        if let Some(job) = job {
            set_limits(
                job,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK,
            )?;
        }
        Ok(InstallerHandoff { job, _lock: lock })
    }

    impl Drop for InstallerHandoff {
        fn drop(&mut self) {
            // Successful Windows installation exits the process. If extraction
            // or launching fails instead, restore normal child containment.
            if let Some(job) = self.job {
                if let Err(error) = set_limits(job, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) {
                    eprintln!("恢复 Windows 子进程生命周期失败：{error}");
                }
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use std::{
            fs,
            process::{Command, Stdio},
            thread,
            time::{Duration, Instant},
        };
        use windows_sys::Win32::{
            Foundation::{CloseHandle, WAIT_OBJECT_0, WAIT_TIMEOUT},
            System::Threading::{
                OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
                PROCESS_TERMINATE, TerminateProcess, WaitForSingleObject,
            },
            UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_HIDE},
        };

        fn wait_for(path: &std::path::Path) {
            let deadline = Instant::now() + Duration::from_secs(15);
            while !path.exists() {
                assert!(
                    Instant::now() < deadline,
                    "timed out waiting for {}",
                    path.display()
                );
                thread::sleep(Duration::from_millis(20));
            }
        }

        // Run in an isolated process: assigning the test runner to a Job would
        // otherwise change unrelated tests and their subprocesses.
        #[test]
        #[ignore = "helper subprocess invoked by installer_survives_only_during_handoff"]
        fn job_fixture() {
            let Some(dir) = std::env::var_os("RACKTOP_JOB_FIXTURE_DIR") else {
                return;
            };
            let dir = std::path::PathBuf::from(dir);
            super::install().unwrap();
            super::install().unwrap();
            let executable = std::env::current_exe().unwrap();
            let args = [
                "--exact",
                "process_lifetime::windows::tests::waiting_fixture",
                "--ignored",
                "--nocapture",
            ];
            let ssh = Command::new(&executable)
                .args(args)
                .env_remove("RACKTOP_JOB_FIXTURE_DIR")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let mode = std::env::var("RACKTOP_JOB_FIXTURE_MODE").unwrap();
            let handoff = if mode != "original" {
                Some(super::installer_handoff().unwrap())
            } else {
                None
            };
            if handoff.is_some() {
                assert!(
                    super::installer_handoff().is_err(),
                    "reject overlapping installers"
                );
            }
            if mode == "rollback" {
                drop(handoff);
            } else {
                std::mem::forget(handoff);
            }
            // Match the official updater's actual launch API, not just a
            // std::process::Command model of Windows child inheritance.
            use std::os::windows::ffi::OsStrExt;
            let executable: Vec<u16> = executable
                .as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect();
            let parameters: Vec<u16> = args.join(" ").encode_utf16().chain(Some(0)).collect();
            let launched = unsafe {
                ShellExecuteW(
                    std::ptr::null_mut(),
                    windows_sys::w!("open"),
                    executable.as_ptr(),
                    parameters.as_ptr(),
                    std::ptr::null(),
                    SW_HIDE,
                )
            };
            assert!(launched as isize > 32);
            wait_for(&dir.join("installer-ready"));
            let installer_pid = fs::read_to_string(dir.join("installer-pid")).unwrap();
            fs::write(dir.join("pids"), format!("{} {}", ssh.id(), installer_pid)).unwrap();
            fs::write(dir.join("ready"), "").unwrap();
            wait_for(&dir.join("exit"));
            std::process::exit(0);
        }

        #[test]
        #[ignore = "long-lived child used by the isolated Windows job test"]
        fn waiting_fixture() {
            if let Some(dir) = std::env::var_os("RACKTOP_JOB_FIXTURE_DIR") {
                let dir = std::path::PathBuf::from(dir);
                fs::write(dir.join("installer-pid"), std::process::id().to_string()).unwrap();
                fs::write(dir.join("installer-ready"), "").unwrap();
            }
            thread::sleep(Duration::from_secs(60));
        }

        #[test]
        fn installer_survives_only_during_handoff() {
            for mode in ["original", "handoff", "rollback"] {
                let dir = tempfile::tempdir().unwrap();
                let mut fixture = Command::new(std::env::current_exe().unwrap())
                    .args([
                        "--exact",
                        "process_lifetime::windows::tests::job_fixture",
                        "--ignored",
                        "--nocapture",
                    ])
                    .env("RACKTOP_JOB_FIXTURE_DIR", dir.path())
                    .env("RACKTOP_JOB_FIXTURE_MODE", mode)
                    .spawn()
                    .unwrap();
                wait_for(&dir.path().join("ready"));
                let pids = fs::read_to_string(dir.path().join("pids")).unwrap();
                let handles: Vec<_> = pids
                    .split_whitespace()
                    .map(|pid| {
                        let handle = unsafe {
                            OpenProcess(
                                PROCESS_QUERY_LIMITED_INFORMATION
                                    | PROCESS_TERMINATE
                                    | PROCESS_SYNCHRONIZE,
                                0,
                                pid.parse().unwrap(),
                            )
                        };
                        assert!(!handle.is_null());
                        handle
                    })
                    .collect();
                fs::write(dir.path().join("exit"), "").unwrap();
                assert!(fixture.wait().unwrap().success());
                let ssh_status = unsafe { WaitForSingleObject(handles[0], 5000) };
                let installer_status = unsafe {
                    WaitForSingleObject(handles[1], if mode == "handoff" { 200 } else { 5000 })
                };
                // Always clean up, including on a failed assertion.
                for handle in handles {
                    unsafe {
                        TerminateProcess(handle, 0);
                        CloseHandle(handle);
                    }
                }
                assert_eq!(
                    ssh_status, WAIT_OBJECT_0,
                    "existing SSH must be reaped: {mode}"
                );
                assert_eq!(
                    installer_status,
                    if mode == "handoff" {
                        WAIT_TIMEOUT
                    } else {
                        WAIT_OBJECT_0
                    },
                    "installer lifecycle: {mode}"
                );
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub fn install() -> Result<(), String> {
    windows::install()
}

#[cfg(not(target_os = "windows"))]
pub fn install() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub use windows::installer_handoff;

//! Windows installer handoff without changing other platforms' updater path.
#[tauri::command]
pub async fn install_windows_update(
    webview: tauri::Webview,
    rid: tauri::ResourceId,
    on_event: tauri::ipc::Channel<DownloadEvent>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        let update = webview
            .resources_table()
            .get::<tauri_plugin_updater::Update>(rid)
            .map_err(|error| error.to_string())?;
        let mut started = false;
        // Use the official downloader, including its signature verification.
        // Do not relax process containment during network I/O or on failure.
        let bytes = update
            .download(
                |chunk_length, content_length| {
                    if !started {
                        started = true;
                        let _ = on_event.send(DownloadEvent::Started { content_length });
                    }
                    let _ = on_event.send(DownloadEvent::Progress { chunk_length });
                },
                || {
                    let _ = on_event.send(DownloadEvent::Finished);
                },
            )
            .await
            .map_err(|error| error.to_string())?;
        let _handoff = crate::process_lifetime::installer_handoff()?;
        update.install(bytes).map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (webview, rid, on_event);
        Err("此安装入口仅用于 Windows".to_string())
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

#[cfg(test)]
mod tests {
    use super::DownloadEvent;
    #[test]
    fn download_events_match_the_frontend_updater_protocol() {
        assert_eq!(
            serde_json::to_value(DownloadEvent::Started {
                content_length: Some(100)
            })
            .unwrap(),
            serde_json::json!({"event": "Started", "data": {"contentLength": 100}})
        );
        assert_eq!(
            serde_json::to_value(DownloadEvent::Progress { chunk_length: 20 }).unwrap(),
            serde_json::json!({"event": "Progress", "data": {"chunkLength": 20}})
        );
        assert_eq!(
            serde_json::to_value(DownloadEvent::Finished).unwrap(),
            serde_json::json!({"event": "Finished"})
        );
    }
}

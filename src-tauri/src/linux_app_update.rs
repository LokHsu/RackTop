//! Linux package routing and desktop proxy support for the official updater.
mod proxy;

use gio::prelude::*;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

fn linux_system_proxy() -> Option<reqwest::Proxy> {
    // Keep explicit environment proxies ahead of desktop proxy settings.
    let environment_proxy = ["https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"]
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .find(|value| !value.is_empty());
    let source = gio::SettingsSchemaSource::default()?;
    let schema = source.lookup("org.gnome.system.proxy", true)?;
    let settings = gio::Settings::new_full(&schema, None::<&gio::SettingsBackend>, None);
    let url = environment_proxy.or_else(|| {
        if settings.string("mode") != "manual" {
            return None;
        }
        let https = settings.child("https");
        let mut proxy = proxy_url(&https.string("host"), https.int("port"));
        if proxy.is_none() && settings.boolean("use-same-proxy") {
            let http = settings.child("http");
            proxy = proxy_url(&http.string("host"), http.int("port"));
        }
        proxy.map(|url| url.to_string())
    })?;
    let ignored_hosts = settings.strv("ignore-hosts");
    let no_proxy = std::env::var("NO_PROXY")
        .or_else(|_| std::env::var("no_proxy"))
        .ok();
    proxy::with_bypass(
        &url,
        &ignored_hosts
            .iter()
            .map(|host| host.to_string())
            .collect::<Vec<_>>(),
        no_proxy.as_deref(),
    )
    .ok()
}

fn proxy_url(host: &str, port: i32) -> Option<tauri::Url> {
    if host.trim().is_empty()
        || host.contains(['/', '\\', '@', '?', '#'])
        || !(1..=65535).contains(&port)
    {
        return None;
    }
    let mut url = tauri::Url::parse("http://localhost").ok()?;
    url.set_host(Some(host.trim())).ok()?;
    url.set_port(Some(port as u16)).ok()?;
    Some(url)
}

fn target_for_bundle(bundle: Option<tauri::utils::config::BundleType>) -> Result<Option<String>, String> {
    use tauri::utils::config::BundleType;
    match bundle {
        Some(BundleType::Deb) => Ok(Some(format!("linux-{}-deb", std::env::consts::ARCH))),
        // Prefer the AppImage-specific entry, then the existing generic Linux feed.
        Some(BundleType::AppImage) => Ok(None),
        _ => Err("请使用已安装的 DEB 或原始 AppImage 检查更新；开发程序不支持安装更新".into()),
    }
}

#[tauri::command]
pub async fn check_linux_app_update(webview: tauri::Webview) -> Result<Option<serde_json::Value>, String> {
    let mut builder = webview.updater_builder();
    if let Some(target) = target_for_bundle(tauri::utils::platform::bundle_type())? {
        builder = builder.target(target);
    }
    let proxy = linux_system_proxy();
    let updater = builder
        .timeout(Duration::from_secs(30))
        // This callback also configures package downloads, including redirected hosts.
        .configure_client(move |client| {
            let client = client.connect_timeout(Duration::from_secs(10));
            match &proxy {
                Some(proxy) => client.proxy(proxy.clone()),
                None => client,
            }
        })
        // The Contents API requires this media type to return the file itself.
        .header("Accept", "application/vnd.github.raw+json")
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?;
    let update = updater.check().await.map_err(|error| {
        let mut detail = error.to_string();
        let mut cause = std::error::Error::source(&error);
        while let Some(error) = cause {
            detail.push_str(&format!("；{error}"));
            cause = error.source();
        }
        let hint = match error {
            tauri_plugin_updater::Error::TargetNotFound(_)
            | tauri_plugin_updater::Error::TargetsNotFound(_) =>
                "清单缺少当前安装格式的条目；DEB 需要独立的 -deb 条目及其签名，不能安装 AppImage。",
            _ => "请检查系统 HTTPS 代理或 HTTPS_PROXY，以及 GitHub API/Raw 的网络连接。",
        };
        format!("检查更新失败：{detail}。{hint}")
    })?;
    Ok(update.map(|mut update| {
        // Keep the proxy for downloads but discard the API-specific media type.
        update.headers.remove("accept");
        update.timeout = Some(Duration::from_secs(900));
        let mut metadata = serde_json::json!({
            "currentVersion": update.current_version,
            "version": update.version,
            "date": update.raw_json.get("pub_date"),
            "body": update.body,
            "rawJson": update.raw_json,
        });
        metadata["rid"] = webview.resources_table().add(update).into();
        metadata
    }))
}

#[cfg(test)]
mod tests {
    #[test]
    fn validates_system_proxy_settings() {
        assert_eq!(super::proxy_url("127.0.0.1", 7897).unwrap().as_str(), "http://127.0.0.1:7897/");
        assert_eq!(super::proxy_url("[::1]", 8080).unwrap().as_str(), "http://[::1]:8080/");
        for (host, port) in [("", 7897), ("localhost", 0), ("localhost", 65536), ("http://localhost/path", 7897)] {
            assert!(super::proxy_url(host, port).is_none());
        }
    }

    #[test]
    fn keeps_deb_separate_from_appimage() {
        use tauri::utils::config::BundleType;
        assert_eq!(super::target_for_bundle(Some(BundleType::Deb)).unwrap(), Some(format!("linux-{}-deb", std::env::consts::ARCH)));
        assert_eq!(super::target_for_bundle(Some(BundleType::AppImage)).unwrap(), None);
        assert!(super::target_for_bundle(None).is_err());
        assert!(super::target_for_bundle(Some(BundleType::Rpm)).is_err());
    }
}

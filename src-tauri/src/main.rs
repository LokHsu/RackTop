#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]

fn main() {
    if let Ok(password) = std::env::var("RACKTOP_ASKPASS_PASSWORD") {
        print!("{password}");
        return;
    }
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // Set before Tauri starts threads; avoids blank WebKitGTK windows on
        // drivers that cannot import DMA-BUF buffers. Users can override it.
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }
    racktop_lib::run();
}

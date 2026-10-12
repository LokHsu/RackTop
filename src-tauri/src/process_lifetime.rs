//! Process lifetime containment for child processes started by RackTop.
//!
//! Windows does not automatically terminate descendants when a GUI process
//! exits. A Job Object with KILL_ON_JOB_CLOSE gives every SSH descendant the
//! same lifetime as RackTop, including abnormal process termination.

#[cfg(target_os = "windows")]
mod windows {
    use std::{ptr::null_mut, sync::OnceLock};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, HANDLE},
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
                SetInformationJobObject,
            },
            Threading::GetCurrentProcess,
        },
    };

    static JOB: OnceLock<JobHandle> = OnceLock::new();

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

        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&mut limits as *mut JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            let error = unsafe { GetLastError() };
            unsafe { CloseHandle(job) };
            return Err(format!("无法配置 Windows 子进程作业对象：错误 {error}"));
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

    #[cfg(test)]
    mod tests {
        #[test]
        fn job_install_is_idempotent() {
            super::install().unwrap();
            super::install().unwrap();
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

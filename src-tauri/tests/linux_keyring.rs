#![cfg(target_os = "linux")]

#[test]
#[ignore = "requires an unlocked Secret Service keyring on a session D-Bus"]
fn credentials_survive_reopening_and_can_be_deleted() {
    let account = format!("linux-test-{}", uuid::Uuid::new_v4());
    let entry = keyring::Entry::new("com.racktop.desktop.test", &account).unwrap();
    entry.set_password("racktop-integration-test").unwrap();
    drop(entry);
    let reopened = keyring::Entry::new("com.racktop.desktop.test", &account).unwrap();
    let result = reopened.get_password();
    reopened.delete_credential().unwrap();
    assert_eq!(result.unwrap(), "racktop-integration-test");
    assert!(matches!(reopened.get_password(), Err(keyring::Error::NoEntry)));
}

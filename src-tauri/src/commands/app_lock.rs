use crate::error::{AppError, AppResult};
use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLockHash {
    pub salt: String,
    pub hash: String,
}

fn random_salt() -> AppResult<[u8; 16]> {
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf)
        .map_err(|e| AppError::new("INTERNAL", format!("salt generate failed: {e}")))?;
    Ok(buf)
}

fn hash_with_salt(password: &str, salt: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

fn ensure_password(password: &str) -> AppResult<()> {
    if password.chars().count() < 4 {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            "密码至少 4 个字符",
        ));
    }
    Ok(())
}

/// 生成 salt + SHA-256(salt || password) 十六进制哈希
#[tauri::command]
pub fn app_lock_hash(password: String) -> AppResult<AppLockHash> {
    ensure_password(&password)?;
    let salt = random_salt()?;
    let hash = hash_with_salt(&password, &salt);
    Ok(AppLockHash {
        salt: hex::encode(salt),
        hash,
    })
}

/// 校验密码是否匹配已存 salt/hash
#[tauri::command]
pub fn app_lock_verify(password: String, salt: String, hash: String) -> AppResult<bool> {
    if password.is_empty() || salt.is_empty() || hash.is_empty() {
        return Ok(false);
    }
    let salt_bytes = hex::decode(salt.trim())
        .map_err(|_| AppError::new("INVALID_ARGUMENT", "invalid salt"))?;
    let computed = hash_with_salt(&password, &salt_bytes);
    // 常量时间比较
    Ok(constant_time_eq(computed.as_bytes(), hash.trim().as_bytes()))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify_roundtrip() {
        let made = app_lock_hash("secret123".into()).unwrap();
        assert!(app_lock_verify("secret123".into(), made.salt.clone(), made.hash.clone()).unwrap());
        assert!(!app_lock_verify("wrong".into(), made.salt, made.hash).unwrap());
    }

    #[test]
    fn reject_short_password() {
        assert!(app_lock_hash("abc".into()).is_err());
    }
}

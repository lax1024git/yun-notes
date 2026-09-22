//! Vault file encryption: Argon2id key derivation + AES-256-GCM.
//! Session holds the app-lock password in memory only (never persisted).

use crate::error::{AppError, AppResult};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;

pub const CRYPTO_META_FILE: &str = ".nw-crypto.json";
const MAGIC: &[u8; 3] = b"NW1";
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoMeta {
    pub version: u32,
    pub salt: String,
}

impl CryptoMeta {
    pub fn new_random() -> AppResult<Self> {
        let mut salt = [0u8; SALT_LEN];
        rand::thread_rng().fill_bytes(&mut salt);
        Ok(Self {
            version: 1,
            salt: hex::encode(salt),
        })
    }

    pub fn salt_bytes(&self) -> AppResult<Vec<u8>> {
        hex::decode(self.salt.trim())
            .map_err(|_| AppError::new("CRYPTO_ERROR", "invalid crypto salt"))
    }
}

#[derive(Default)]
pub struct CryptoSession {
    /// App-lock password kept only for this process after unlock.
    password: Option<String>,
}

impl CryptoSession {
    pub fn set_password(&mut self, password: String) {
        self.password = Some(password);
    }

    pub fn clear(&mut self) {
        self.password = None;
    }

    pub fn has_password(&self) -> bool {
        self.password.as_ref().map(|p| !p.is_empty()).unwrap_or(false)
    }

    pub fn password(&self) -> AppResult<&str> {
        self.password
            .as_deref()
            .filter(|p| !p.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "LOCK_REQUIRED",
                    "请先启用并解锁应用锁，才能加解密笔记",
                )
            })
    }
}

pub type SharedCryptoSession = Mutex<CryptoSession>;

pub fn require_session_password(session: &SharedCryptoSession) -> AppResult<String> {
    let guard = session
        .lock()
        .map_err(|_| AppError::new("INTERNAL", "crypto session lock poisoned"))?;
    Ok(guard.password()?.to_string())
}

pub fn derive_key(password: &str, salt: &[u8]) -> AppResult<[u8; KEY_LEN]> {
    // Desktop-friendly Argon2id (faster than server defaults, still resistant).
    let params = Params::new(19456, 2, 1, Some(KEY_LEN))
        .map_err(|e| AppError::new("CRYPTO_ERROR", format!("argon2 params: {e}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; KEY_LEN];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::new("CRYPTO_ERROR", format!("key derive failed: {e}")))?;
    Ok(key)
}

pub fn encrypt_bytes(key: &[u8; KEY_LEN], plaintext: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::new("CRYPTO_ERROR", format!("cipher init: {e}")))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| AppError::new("CRYPTO_ERROR", "encrypt failed"))?;
    let mut out = Vec::with_capacity(MAGIC.len() + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn decrypt_bytes(key: &[u8; KEY_LEN], data: &[u8]) -> AppResult<Vec<u8>> {
    if data.len() < MAGIC.len() + NONCE_LEN + 16 {
        return Err(AppError::new("CRYPTO_ERROR", "ciphertext too short"));
    }
    if &data[..MAGIC.len()] != MAGIC {
        return Err(AppError::new(
            "CRYPTO_ERROR",
            "not an encrypted Lax Tools file",
        ));
    }
    let nonce_start = MAGIC.len();
    let nonce_end = nonce_start + NONCE_LEN;
    let nonce = Nonce::from_slice(&data[nonce_start..nonce_end]);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::new("CRYPTO_ERROR", format!("cipher init: {e}")))?;
    cipher
        .decrypt(nonce, &data[nonce_end..])
        .map_err(|_| AppError::new("CRYPTO_ERROR", "decrypt failed（密码或密文不正确）"))
}

pub fn meta_path(vault: &Path) -> std::path::PathBuf {
    vault.join(CRYPTO_META_FILE)
}

pub fn load_meta(vault: &Path) -> AppResult<Option<CryptoMeta>> {
    let path = meta_path(vault);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)?;
    let meta: CryptoMeta = serde_json::from_str(&raw)?;
    Ok(Some(meta))
}

pub fn save_meta(vault: &Path, meta: &CryptoMeta) -> AppResult<()> {
    if !vault.exists() {
        fs::create_dir_all(vault)?;
    }
    let path = meta_path(vault);
    let raw = serde_json::to_string_pretty(meta)?;
    fs::write(path, raw)?;
    Ok(())
}

/// Load existing vault meta or create a new salt file.
pub fn load_or_create_meta(vault: &Path) -> AppResult<CryptoMeta> {
    if let Some(meta) = load_meta(vault)? {
        return Ok(meta);
    }
    let meta = CryptoMeta::new_random()?;
    save_meta(vault, &meta)?;
    Ok(meta)
}

pub fn key_for_vault(password: &str, vault: &Path) -> AppResult<[u8; KEY_LEN]> {
    let meta = load_or_create_meta(vault)?;
    let salt = meta.salt_bytes()?;
    derive_key(password, &salt)
}

/// Replace vault salt and return a key derived from the new password.
pub fn rotate_meta_and_key(password: &str, vault: &Path) -> AppResult<[u8; KEY_LEN]> {
    let meta = CryptoMeta::new_random()?;
    save_meta(vault, &meta)?;
    let salt = meta.salt_bytes()?;
    derive_key(password, &salt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = derive_key("secret-password", b"0123456789abcdef").unwrap();
        let plain = b"# Hello\nworld";
        let enc = encrypt_bytes(&key, plain).unwrap();
        assert!(enc.starts_with(MAGIC));
        let dec = decrypt_bytes(&key, &enc).unwrap();
        assert_eq!(dec, plain);
    }

    #[test]
    fn wrong_key_fails() {
        let key1 = derive_key("a", b"0123456789abcdef").unwrap();
        let key2 = derive_key("b", b"0123456789abcdef").unwrap();
        let enc = encrypt_bytes(&key1, b"data").unwrap();
        assert!(decrypt_bytes(&key2, &enc).is_err());
    }
}

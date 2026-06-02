//! Outbound proxy for the embedded LLM Assistant (Track C).
//!
//! The console webview cannot reach external hosts (locked CSP), and proxying here also
//! avoids per-provider browser CORS. This command is NOT a general HTTP egress: it takes a
//! `provider` (not a URL), maps it to a fixed allowlisted endpoint, attaches the provider's
//! auth header, and POSTs the caller-built body. Unknown providers are rejected.

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmResponse {
    pub status: u16,
    pub body: Value,
}

/// Allowlisted base endpoints. Returns `None` for unknown providers.
fn provider_base_url(provider: &str) -> Option<&'static str> {
    match provider {
        "anthropic" => Some("https://api.anthropic.com/v1/messages"),
        "openai" => Some("https://api.openai.com/v1/chat/completions"),
        // Gemini puts the model in the path and the key in the query string.
        "gemini" => Some("https://generativelanguage.googleapis.com/v1beta"),
        _ => None,
    }
}

fn gemini_url(model: &str, api_key: &str) -> String {
    format!(
        "{}/models/{}:generateContent?key={}",
        provider_base_url("gemini").expect("gemini base url"),
        model,
        api_key,
    )
}

#[tauri::command]
pub async fn llm_complete(
    provider: String,
    model: String,
    api_key: String,
    body: Value,
) -> Result<LlmResponse, String> {
    let client = reqwest::Client::new();

    let req = match provider.as_str() {
        "anthropic" => client
            .post(provider_base_url("anthropic").unwrap())
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        "openai" => client
            .post(provider_base_url("openai").unwrap())
            .bearer_auth(api_key),
        "gemini" => client.post(gemini_url(&model, &api_key)),
        other => return Err(format!("unknown LLM provider: {other}")),
    };

    let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    // Providers return JSON for both success and error; fall back to Null if not JSON.
    let body = resp.json::<Value>().await.unwrap_or(Value::Null);
    Ok(LlmResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_providers_have_endpoints() {
        assert!(provider_base_url("anthropic").is_some());
        assert!(provider_base_url("openai").is_some());
        assert!(provider_base_url("gemini").is_some());
    }

    #[test]
    fn unknown_provider_has_no_endpoint() {
        assert!(provider_base_url("evil-host").is_none());
        assert!(provider_base_url("http://attacker").is_none());
    }

    #[test]
    fn gemini_url_embeds_model_and_key() {
        let url = gemini_url("gemini-2.0-flash", "KEY123");
        assert_eq!(
            url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEY123"
        );
    }
}

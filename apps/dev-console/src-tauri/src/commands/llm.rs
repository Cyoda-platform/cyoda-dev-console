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

/// Build the Gemini URL with the model as a single (percent-encoded) path segment and the
/// key as a query parameter. Parsing from the fixed base guarantees the host cannot be
/// changed by a crafted `model`, and segment/query encoding prevents path/query injection.
fn gemini_url(model: &str, api_key: &str) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(provider_base_url("gemini").expect("gemini base url"))
        .map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "invalid gemini base url".to_string())?
        .push("models")
        .push(&format!("{model}:generateContent"));
    url.query_pairs_mut().append_pair("key", api_key);
    Ok(url)
}

#[tauri::command]
pub async fn llm_complete(
    provider: String,
    model: String,
    api_key: String,
    body: Value,
) -> Result<LlmResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let req = match provider.as_str() {
        "anthropic" => client
            .post(provider_base_url("anthropic").unwrap())
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        "openai" => client
            .post(provider_base_url("openai").unwrap())
            .bearer_auth(api_key),
        "gemini" => client.post(gemini_url(&model, &api_key)?),
        other => return Err(format!("unknown LLM provider: {other}")),
    };

    // without_url() strips the request URL from the error string. For Gemini, the
    // URL contains the API key as a ?key= query parameter; without this, a network
    // failure would return the key verbatim to the frontend.
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| e.without_url().to_string())?;
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
        let url = gemini_url("gemini-2.0-flash", "KEY123").unwrap();
        assert_eq!(
            url.as_str(),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEY123"
        );
    }

    #[test]
    fn gemini_url_cannot_be_redirected_to_another_host() {
        // A crafted model must not escape the fixed Google host, and path-significant
        // characters must be encoded rather than restructuring the URL.
        let url = gemini_url("../../../evil?x=", "K").unwrap();
        assert_eq!(url.host_str(), Some("generativelanguage.googleapis.com"));
        // The single key query param is the only query; no injected params survive.
        assert_eq!(url.query_pairs().count(), 1);
    }

    #[test]
    fn gemini_url_contains_api_key_in_query_string() {
        // Documents WHY llm_complete uses .without_url() when mapping the send error:
        // the key is embedded as ?key= and would appear in the default reqwest error string.
        let url = gemini_url("gemini-2.0-flash", "sk-secret-abc").unwrap();
        assert!(
            url.as_str().contains("sk-secret-abc"),
            "Gemini URL must embed the key as a query param — strip it from errors with without_url()"
        );
    }
}

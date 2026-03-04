'use strict';

const https = require('https');
const http = require('http');

/**
 * LLM API client. Supports OpenAI, Anthropic, and Google Gemini.
 *
 * Config: { provider, apiKey, model, baseUrl?, maxTokens?, temperature? }
 */

function callOpenAI(config, systemPrompt, userPrompt) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({
      model: config.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.7
    });

    const url = new URL(config.baseUrl || 'https://api.openai.com/v1/chat/completions');
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const transport = url.protocol === 'http:' ? http : https;
    const req = transport.request(options, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message
            ? parsed.choices[0].message.content
            : '';
          resolve({
            content: content.trim(),
            usage: parsed.usage || {},
            model: parsed.model
          });
        } catch (e) {
          reject(new Error('Parse error: ' + e.message + ' — raw: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callAnthropic(config, systemPrompt, userPrompt) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: config.maxTokens || 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      temperature: config.temperature || 0.7
    });

    const url = new URL(config.baseUrl || 'https://api.anthropic.com/v1/messages');
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const transport = url.protocol === 'http:' ? http : https;
    const req = transport.request(options, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.content && parsed.content[0] ? parsed.content[0].text : '';
          resolve({
            content: text.trim(),
            usage: parsed.usage || {},
            model: parsed.model
          });
        } catch (e) {
          reject(new Error('Parse error: ' + e.message + ' — raw: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callGemini(config, systemPrompt, userPrompt) {
  return new Promise(function (resolve, reject) {
    const model = config.model || 'gemini-2.0-flash';
    const url = new URL(
      config.baseUrl ||
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + config.apiKey
    );

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: config.maxTokens || 4096,
        temperature: config.temperature || 0.7
      }
    });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content
            ? parsed.candidates[0].content.parts.map(function (p) { return p.text; }).join('')
            : '';
          resolve({
            content: text.trim(),
            usage: parsed.usageMetadata || {},
            model: model
          });
        } catch (e) {
          reject(new Error('Parse error: ' + e.message + ' — raw: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generate(config, systemPrompt, userPrompt) {
  switch (config.provider) {
    case 'openai':    return callOpenAI(config, systemPrompt, userPrompt);
    case 'anthropic': return callAnthropic(config, systemPrompt, userPrompt);
    case 'gemini':    return callGemini(config, systemPrompt, userPrompt);
    default:          throw new Error('Unknown provider: ' + config.provider);
  }
}

module.exports = { generate };

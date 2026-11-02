import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import axios from 'axios';
import { normalizeUploadError, UPLOAD_TIMEOUT_MS } from '../src/services/uploadErrors.js';

const source = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
const start = source.indexOf('    uploadDocument: async');
const end = source.indexOf('    deleteDocument:', start);
let received = 0;
let reject = false;
const server = http.createServer((req, res) => {
    assert.equal(req.url, '/api/folders/documents');
    assert.equal(req.headers.authorization, 'Bearer test-token');
    assert.match(req.headers['content-type'], /multipart\/form-data; boundary=/);
    req.on('data', chunk => { received += chunk.length; });
    req.on('end', () => {
        res.writeHead(reject ? 413 : 200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(reject ? {error: {message: 'Storage limit exceeded'}} : {id: 'test-document'}));
    });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const api = new Function('axios', 'UPLOAD_API_BASE_URL', 'authAPI', 'localStorage', 'normalizeUploadError', 'UPLOAD_TIMEOUT_MS',
        `return ({${source.slice(start, end)}})`)(axios, base, {getCurrentUser: () => ({id: 'test-user'})}, {getItem: () => 'test-token'}, normalizeUploadError, UPLOAD_TIMEOUT_MS);
    const file = new File([new Uint8Array(72 * 1024 * 1024)], 'MLT-NOR-ESD1157(CONC)(REV1).pdf', {type: 'application/pdf'});
    const result = await api.uploadDocument('test-folder', '1', file, null);
    assert.equal(result.id, 'test-document');
    assert.ok(received > file.size, 'Entire 72 MiB file and multipart metadata must arrive');
    reject = true;
    await assert.rejects(api.uploadDocument('test-folder', '1', new File(['pdf'], 'test.pdf'), null), error => {
        assert.equal(error.response.status, 413);
        assert.match(error.message, /Storage limit exceeded.*HTTP 413/);
        return true;
    });
    console.log('72 MiB upload, authentication, multipart transfer and structured HTTP error tests passed');
} finally {
    await new Promise(resolve => server.close(resolve));
}

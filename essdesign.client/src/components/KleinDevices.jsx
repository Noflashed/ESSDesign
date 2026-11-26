import { useEffect, useState } from 'react';
import { kleinAPI } from '../services/api';

const permissions = {
    'employees.read': 'Search employee names and roles',
    'design.read': 'Read folders, drawings and recipient names',
    'design.write': 'Upload and replace drawings',
    notify: 'Share drawings and notify recipients',
    'register.write': 'Add and update drawing register entries',
};

export default function KleinDevices({ code }) {
    const [device, setDevice] = useState(null);
    const [devices, setDevices] = useState([]);
    const [scopes, setScopes] = useState(Object.keys(permissions));
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(true);
    const [done, setDone] = useState(false);
    const error = e => e.response?.status === 410 ? 'This pairing code has expired or has already been used.' : 'ESS could not complete this request. Please try again.';
    useEffect(() => {
        let active = true;
        const request = code ? kleinAPI.details(code) : kleinAPI.list();
        request.then(({data}) => { if (active) (code ? setDevice : setDevices)(data); })
            .catch(e => { if (active) setMessage(error(e)); })
            .finally(() => { if (active) setBusy(false); });
        return () => { active = false; };
    }, [code]);
    async function decide(approve) {
        setBusy(true);
        try {
            await kleinAPI.decide(approve, code, scopes);
            setDone(true);
            setMessage(approve ? 'Approved. Return to Klein to finish connecting.' : 'Pairing denied.');
        } catch (e) { setMessage(error(e)); }
        finally { setBusy(false); }
    }
    async function revoke(d) {
        setBusy(true);
        try {
            await kleinAPI.remove(d.id);
            setDevices(items => items.filter(item => item.id !== d.id));
            setMessage(d.name + ' disconnected.');
        } catch (e) { setMessage(error(e)); }
        finally { setBusy(false); }
    }
    return <main style={{maxWidth:560, margin:'3rem auto', padding:'1rem'}}>
        <a href="/">Back to ESS Design</a>
        <h1>{code ? 'Connect Klein' : 'Connected devices'}</h1>
        {busy && <p role="status">Working…</p>}
        {message && <p role="status">{message}</p>}
        {device && !done && <section>
            <p>Approve <strong>{device.name}</strong> ({device.platform}) if Klein shows the same code on your device.</p>
            <p>Pairing code <strong>{code}</strong></p>
            <fieldset disabled={busy}><legend>Allow this device to</legend>
                {Object.entries(permissions).map(([scope,label]) => <label key={scope} style={{display:'block',padding:4}}>
                    <input type="checkbox" checked={scopes.includes(scope)} onChange={e => setScopes(items => e.target.checked ? [...items,scope] : items.filter(x => x !== scope))}/> {label}
                </label>)}
            </fieldset>
            <p><button disabled={busy || !scopes.length} onClick={() => decide(true)}>Approve</button> <button disabled={busy} onClick={() => decide(false)}>Deny</button></p>
        </section>}
        {!code && !busy && !devices.length && !message && <p>No connected devices.</p>}
        {!code && devices.map(d => <section key={d.id}><h2>{d.name}</h2><p>{d.platform} · {d.scopes.map(s => permissions[s]).join(', ')}</p><button disabled={busy} onClick={() => revoke(d)}>Disconnect {d.name}</button></section>)}
    </main>;
}

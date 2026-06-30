import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { preferencesAPI, usersAPI } from '../services/api';

function getRoleDisplayName(role) {
    switch (role) {
        case 'admin': return 'Admin';
        case 'scaffold_designer': return 'Scaffold Designer';
        case 'site_supervisor': return 'Site Supervisor';
        case 'project_manager': return 'Project Manager';
        case 'leading_hand': return 'Leading Hand';
        case 'general_scaffolder': return 'Scaffolder';
        case 'transport_management': return 'Transport Management';
        case 'truck_ess01': return 'Truck ESS01';
        case 'truck_ess02': return 'Truck ESS02';
        case 'truck_ess03': return 'Truck ESS03';
        default: return 'Viewer';
    }
}

function splitName(fullName = '') {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] || '',
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : ''
    };
}

function formatInputDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

function buildForm(user) {
    const name = splitName(user?.fullName || '');
    const address = user?.personalAddress || [user?.addressStreet, user?.addressCity, user?.addressState, user?.addressPostalCode]
        .filter(Boolean)
        .join(', ');

    return {
        firstName: name.firstName,
        lastName: name.lastName,
        preferredName: user?.preferredName || name.firstName,
        dateOfBirth: formatInputDate(user?.dateOfBirth),
        gender: user?.gender || '',
        employeeId: user?.employeeId || user?.id || '',
        phoneNumber: user?.phoneNumber || user?.employeePhoneNumber || '',
        email: user?.email || '',
        personalAddress: address || '',
        addressStreet: user?.addressStreet || '',
        addressCity: user?.addressCity || '',
        addressState: user?.addressState || '',
        addressPostalCode: user?.addressPostalCode || '',
        addressCountry: user?.addressCountry || 'Australia',
        emergencyContactName: user?.emergencyContactName || '',
        emergencyRelationship: user?.emergencyRelationship || '',
        emergencyPhoneNumber: user?.emergencyPhoneNumber || '',
        emergencyEmail: user?.emergencyEmail || '',
        emergencyAddress: user?.emergencyAddress || ''
    };
}

function Field({ label, children, wide = false }) {
    return (
        <label className={`employee-profile-field${wide ? ' wide' : ''}`}>
            <span>{label}</span>
            {children}
        </label>
    );
}

function ToggleRow({ label, description, checked, onChange }) {
    return (
        <label className="employee-profile-toggle-row">
            <span>
                <strong>{label}</strong>
                <small>{description}</small>
            </span>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        </label>
    );
}

export default function EmployeeProfilePage({ user, onUserUpdated }) {
    const photoInputRef = useRef(null);
    const [form, setForm] = useState(() => buildForm(user));
    const [prefs, setPrefs] = useState({
        emailNotifications: true,
        smsNotifications: true,
        systemAnnouncements: true,
        marketingUpdates: false
    });
    const [initialSnapshot, setInitialSnapshot] = useState('');
    const [loadingPrefs, setLoadingPrefs] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const nextForm = buildForm(user);
        setForm(nextForm);
        setInitialSnapshot(JSON.stringify({ form: nextForm, prefs }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    useEffect(() => {
        let active = true;
        preferencesAPI.getPreferences()
            .then((data) => {
                if (!active) return;
                const nextPrefs = {
                    emailNotifications: data?.emailNotifications ?? true,
                    smsNotifications: data?.smsNotifications ?? true,
                    systemAnnouncements: data?.systemAnnouncements ?? true,
                    marketingUpdates: data?.marketingUpdates ?? false
                };
                setPrefs(nextPrefs);
                setInitialSnapshot(JSON.stringify({ form: buildForm(user), prefs: nextPrefs }));
            })
            .catch(() => {
                if (active) setInitialSnapshot(JSON.stringify({ form: buildForm(user), prefs }));
            })
            .finally(() => {
                if (active) setLoadingPrefs(false);
            });
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const fullName = useMemo(() => [form.firstName, form.lastName].filter(Boolean).join(' ').trim(), [form.firstName, form.lastName]);
    const roleLabel = getRoleDisplayName(user?.role);
    const currentSnapshot = JSON.stringify({ form, prefs });
    const hasChanges = currentSnapshot !== initialSnapshot;
    const initials = fullName
        ? fullName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
        : (user?.email?.[0]?.toUpperCase() || 'U');

    const updateForm = (key, value) => {
        setForm((current) => ({ ...current, [key]: value }));
        setMessage('');
        setError('');
    };

    const updatePrefs = (key, value) => {
        setPrefs((current) => ({ ...current, [key]: value }));
        setMessage('');
        setError('');
    };

    const cancelChanges = () => {
        const snapshot = initialSnapshot ? JSON.parse(initialSnapshot) : { form: buildForm(user), prefs };
        setForm(snapshot.form);
        setPrefs(snapshot.prefs);
        setMessage('');
        setError('');
    };

    const saveProfile = async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        setError('');

        try {
            const profilePayload = {
                fullName,
                preferredName: form.preferredName,
                email: form.email,
                phoneNumber: form.phoneNumber,
                dateOfBirth: form.dateOfBirth || null,
                gender: form.gender,
                personalAddress: form.personalAddress,
                addressStreet: form.addressStreet,
                addressCity: form.addressCity,
                addressState: form.addressState,
                addressPostalCode: form.addressPostalCode,
                addressCountry: form.addressCountry,
                emergencyContactName: form.emergencyContactName,
                emergencyRelationship: form.emergencyRelationship,
                emergencyPhoneNumber: form.emergencyPhoneNumber,
                emergencyEmail: form.emergencyEmail,
                emergencyAddress: form.emergencyAddress
            };

            const [updatedUser] = await Promise.all([
                usersAPI.updateMyProfile(profilePayload),
                preferencesAPI.updatePreferences(prefs)
            ]);

            onUserUpdated?.(updatedUser);
            const nextForm = buildForm(updatedUser);
            setForm(nextForm);
            setInitialSnapshot(JSON.stringify({ form: nextForm, prefs }));
            setMessage('Profile updated successfully.');
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Unable to save profile.');
        } finally {
            setSaving(false);
        }
    };

    const uploadProfilePhoto = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadingPhoto(true);
        setMessage('');
        setError('');
        try {
            const profileImageUrl = await usersAPI.uploadProfileImage(user?.id, file);
            const updatedUser = { ...user, profileImageUrl };
            onUserUpdated?.(updatedUser);
            setMessage('Profile photo updated.');
        } catch (err) {
            setError(err.message || 'Unable to upload profile photo.');
        } finally {
            setUploadingPhoto(false);
            event.target.value = '';
        }
    };

    return (
        <form className="employee-profile-page" onSubmit={saveProfile}>
            <div className="employee-profile-topbar">
                <h1>My Profile</h1>
                <div className="employee-profile-actions">
                    <button type="button" className="employee-profile-secondary" onClick={cancelChanges} disabled={!hasChanges || saving}>
                        Cancel
                    </button>
                    <button type="submit" className="employee-profile-primary" disabled={!hasChanges || saving || loadingPrefs}>
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <section className="employee-profile-summary">
                <div className="employee-profile-avatar-block">
                    <span className="employee-profile-avatar">
                        {user?.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : initials}
                    </span>
                    <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="employee-profile-photo-input"
                        onChange={uploadProfilePhoto}
                    />
                    <button
                        type="button"
                        className="employee-profile-link"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={uploadingPhoto}
                    >
                        {uploadingPhoto ? 'Uploading photo...' : 'Update profile photo'}
                    </button>
                </div>
                <div className="employee-profile-identity">
                    <h2>{fullName || 'Your name'}</h2>
                    <p>{roleLabel}</p>
                    <span className="employee-profile-verified"><Check size={15} /> Verified</span>
                </div>
                <dl className="employee-profile-meta">
                    <div><dt>Employee ID</dt><dd>{form.employeeId || '-'}</dd></div>
                    <div><dt>Department</dt><dd>{roleLabel}</dd></div>
                    <div><dt>Location</dt><dd>ESS Design</dd></div>
                    <div><dt>Manager</dt><dd>{user?.role === 'admin' ? 'Company Admin' : 'Not assigned'}</dd></div>
                    <div><dt>Account Status</dt><dd><span className="employee-profile-status-dot" /> Active</dd></div>
                    <div><dt>Member Since</dt><dd>-</dd></div>
                </dl>
            </section>

            <div className="employee-profile-grid">
                <section className="employee-profile-panel">
                    <h3>Personal Information</h3>
                    <div className="employee-profile-form-grid">
                        <Field label="First Name"><input value={form.firstName} onChange={(e) => updateForm('firstName', e.target.value)} /></Field>
                        <Field label="Last Name"><input value={form.lastName} onChange={(e) => updateForm('lastName', e.target.value)} /></Field>
                        <Field label="Date of Birth"><input type="date" value={form.dateOfBirth} onChange={(e) => updateForm('dateOfBirth', e.target.value)} /></Field>
                        <Field label="Gender">
                            <span className="employee-profile-select-wrap">
                                <select value={form.gender} onChange={(e) => updateForm('gender', e.target.value)}>
                                    <option value="">Not specified</option>
                                    <option value="Female">Female</option>
                                    <option value="Male">Male</option>
                                    <option value="Non-binary">Non-binary</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                                <ChevronDown size={16} />
                            </span>
                        </Field>
                        <Field label="Preferred Name (Optional)"><input value={form.preferredName} onChange={(e) => updateForm('preferredName', e.target.value)} /></Field>
                        <Field label="Employee ID"><input value={form.employeeId} disabled /></Field>
                    </div>
                </section>

                <section className="employee-profile-panel">
                    <h3>Emergency Contact</h3>
                    <div className="employee-profile-form-grid">
                        <Field label="Contact Name"><input value={form.emergencyContactName} onChange={(e) => updateForm('emergencyContactName', e.target.value)} /></Field>
                        <Field label="Relationship"><input value={form.emergencyRelationship} onChange={(e) => updateForm('emergencyRelationship', e.target.value)} /></Field>
                        <Field label="Phone Number"><input value={form.emergencyPhoneNumber} onChange={(e) => updateForm('emergencyPhoneNumber', e.target.value)} /></Field>
                        <Field label="Email Address"><input type="email" value={form.emergencyEmail} onChange={(e) => updateForm('emergencyEmail', e.target.value)} /></Field>
                        <Field label="Address" wide><input value={form.emergencyAddress} onChange={(e) => updateForm('emergencyAddress', e.target.value)} /></Field>
                    </div>
                </section>

                <section className="employee-profile-panel compact">
                    <h3>Contact Details</h3>
                    <div className="employee-profile-form-grid">
                        <Field label="Phone Number"><input value={form.phoneNumber} onChange={(e) => updateForm('phoneNumber', e.target.value)} /></Field>
                        <Field label="Email Address"><input type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} required /></Field>
                    </div>
                    <span className="employee-profile-inline-verified"><Check size={14} /> Verified</span>
                </section>

                <section className="employee-profile-panel">
                    <h3>Notification Preferences</h3>
                    <p className="employee-profile-panel-copy">Choose how you would like to receive notifications from the system.</p>
                    <div className="employee-profile-toggle-list">
                        <ToggleRow label="Email Notifications" description="Receive important updates and alerts via email." checked={prefs.emailNotifications} onChange={(value) => updatePrefs('emailNotifications', value)} />
                        <ToggleRow label="SMS Notifications" description="Receive text messages for critical alerts and updates." checked={prefs.smsNotifications} onChange={(value) => updatePrefs('smsNotifications', value)} />
                        <ToggleRow label="System Announcements" description="Receive announcements about updates and maintenance." checked={prefs.systemAnnouncements} onChange={(value) => updatePrefs('systemAnnouncements', value)} />
                        <ToggleRow label="Marketing & Product Updates" description="Receive occasional updates about new features and improvements." checked={prefs.marketingUpdates} onChange={(value) => updatePrefs('marketingUpdates', value)} />
                    </div>
                </section>

                <section className="employee-profile-panel">
                    <h3>Address</h3>
                    <Field label="Personal Address" wide><input value={form.personalAddress} onChange={(e) => updateForm('personalAddress', e.target.value)} /></Field>
                    <Field label="Street Address" wide><input value={form.addressStreet} onChange={(e) => updateForm('addressStreet', e.target.value)} /></Field>
                    <div className="employee-profile-form-grid quarters">
                        <Field label="City"><input value={form.addressCity} onChange={(e) => updateForm('addressCity', e.target.value)} /></Field>
                        <Field label="State / Province"><input value={form.addressState} onChange={(e) => updateForm('addressState', e.target.value)} /></Field>
                        <Field label="ZIP / Postal Code"><input value={form.addressPostalCode} onChange={(e) => updateForm('addressPostalCode', e.target.value)} /></Field>
                        <Field label="Country"><input value={form.addressCountry} onChange={(e) => updateForm('addressCountry', e.target.value)} /></Field>
                    </div>
                </section>
            </div>

            {message ? <div className="employee-profile-toast success">{message}</div> : null}
            {error ? <div className="employee-profile-toast error">{error}</div> : null}
        </form>
    );
}

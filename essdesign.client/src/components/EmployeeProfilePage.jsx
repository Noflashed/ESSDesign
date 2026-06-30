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

function Panel({ title, editing, saving, changed, onEdit, onCancel, onSave, children, className = '' }) {
    return (
        <section className={`employee-profile-panel ${className}`.trim()}>
            <div className="employee-profile-panel-head">
                <h3>{title}</h3>
                <div className="employee-profile-panel-actions">
                    {editing ? (
                        <>
                            <button type="button" className="employee-profile-panel-secondary" onClick={onCancel} disabled={saving}>
                                Cancel
                            </button>
                            <button type="button" className="employee-profile-panel-primary" onClick={onSave} disabled={!changed || saving}>
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </>
                    ) : (
                        <button type="button" className="employee-profile-panel-edit" onClick={onEdit}>
                            Edit
                        </button>
                    )}
                </div>
            </div>
            {children}
        </section>
    );
}

function ToggleRow({ label, description, checked, onChange, disabled = false }) {
    return (
        <label className="employee-profile-toggle-row">
            <span>
                <strong>{label}</strong>
                <small>{description}</small>
            </span>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        </label>
    );
}

const SECTION_KEYS = ['personal', 'emergency', 'contact', 'notifications', 'address'];

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
    const [saving, setSaving] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [editingSections, setEditingSections] = useState(() => Object.fromEntries(SECTION_KEYS.map((key) => [key, false])));
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
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const fullName = useMemo(() => [form.firstName, form.lastName].filter(Boolean).join(' ').trim(), [form.firstName, form.lastName]);
    const roleLabel = getRoleDisplayName(user?.role);
    const initialState = useMemo(() => {
        try {
            return initialSnapshot ? JSON.parse(initialSnapshot) : { form: buildForm(user), prefs };
        } catch {
            return { form: buildForm(user), prefs };
        }
    }, [initialSnapshot, user]);
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

    const setSectionEditing = (section, value) => {
        setEditingSections((current) => ({ ...current, [section]: value }));
        setMessage('');
        setError('');
    };

    const cancelSection = (section) => {
        setForm(initialState.form);
        setPrefs(initialState.prefs);
        setSectionEditing(section, false);
    };

    const sectionChanged = (section) => {
        const previousForm = initialState.form || {};
        const previousPrefs = initialState.prefs || {};
        const changedFormKeys = {
            personal: ['firstName', 'lastName', 'preferredName', 'dateOfBirth', 'gender'],
            emergency: ['emergencyContactName', 'emergencyRelationship', 'emergencyPhoneNumber', 'emergencyEmail', 'emergencyAddress'],
            contact: ['phoneNumber', 'email'],
            address: ['personalAddress', 'addressStreet', 'addressCity', 'addressState', 'addressPostalCode', 'addressCountry']
        };
        const changedPrefKeys = {
            notifications: ['emailNotifications', 'smsNotifications', 'systemAnnouncements', 'marketingUpdates']
        };

        return (changedFormKeys[section] || []).some((key) => form[key] !== previousForm[key])
            || (changedPrefKeys[section] || []).some((key) => prefs[key] !== previousPrefs[key]);
    };

    const saveProfile = async (event, section = null) => {
        event?.preventDefault?.();
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
            if (section) {
                setSectionEditing(section, false);
            } else {
                setEditingSections(Object.fromEntries(SECTION_KEYS.map((key) => [key, false])));
            }
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
                    <div><dt>Position</dt><dd>{roleLabel}</dd></div>
                    <div><dt>Account Status</dt><dd><span className="employee-profile-status-dot" /> Active</dd></div>
                    <div><dt>Member Since</dt><dd>-</dd></div>
                </dl>
            </section>

            <div className="employee-profile-grid">
                <div className="employee-profile-column">
                <Panel
                    title="Personal Information"
                    editing={editingSections.personal}
                    saving={saving}
                    changed={sectionChanged('personal')}
                    onEdit={() => setSectionEditing('personal', true)}
                    onCancel={() => cancelSection('personal')}
                    onSave={() => saveProfile(null, 'personal')}
                >
                    <div className="employee-profile-form-grid">
                        <Field label="First Name"><input value={form.firstName} disabled={!editingSections.personal} onChange={(e) => updateForm('firstName', e.target.value)} /></Field>
                        <Field label="Last Name"><input value={form.lastName} disabled={!editingSections.personal} onChange={(e) => updateForm('lastName', e.target.value)} /></Field>
                        <Field label="Date of Birth"><input type="date" value={form.dateOfBirth} disabled={!editingSections.personal} onChange={(e) => updateForm('dateOfBirth', e.target.value)} /></Field>
                        <Field label="Gender">
                            <span className="employee-profile-select-wrap">
                                <select value={form.gender} disabled={!editingSections.personal} onChange={(e) => updateForm('gender', e.target.value)}>
                                    <option value="">Not specified</option>
                                    <option value="Female">Female</option>
                                    <option value="Male">Male</option>
                                    <option value="Non-binary">Non-binary</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                                <ChevronDown size={16} />
                            </span>
                        </Field>
                        <Field label="Preferred Name (Optional)"><input value={form.preferredName} disabled={!editingSections.personal} onChange={(e) => updateForm('preferredName', e.target.value)} /></Field>
                        <Field label="Employee ID"><input value={form.employeeId} disabled /></Field>
                    </div>
                </Panel>

                <Panel
                    title="Contact Details"
                    className="compact"
                    editing={editingSections.contact}
                    saving={saving}
                    changed={sectionChanged('contact')}
                    onEdit={() => setSectionEditing('contact', true)}
                    onCancel={() => cancelSection('contact')}
                    onSave={() => saveProfile(null, 'contact')}
                >
                    <div className="employee-profile-form-grid">
                        <Field label="Phone Number"><input value={form.phoneNumber} disabled={!editingSections.contact} onChange={(e) => updateForm('phoneNumber', e.target.value)} /></Field>
                        <Field label="Email Address"><input type="email" value={form.email} disabled={!editingSections.contact} onChange={(e) => updateForm('email', e.target.value)} required /></Field>
                    </div>
                    <span className="employee-profile-inline-verified"><Check size={14} /> Verified</span>
                </Panel>

                <Panel
                    title="Address"
                    editing={editingSections.address}
                    saving={saving}
                    changed={sectionChanged('address')}
                    onEdit={() => setSectionEditing('address', true)}
                    onCancel={() => cancelSection('address')}
                    onSave={() => saveProfile(null, 'address')}
                >
                    <Field label="Personal Address" wide><input value={form.personalAddress} disabled={!editingSections.address} onChange={(e) => updateForm('personalAddress', e.target.value)} /></Field>
                    <Field label="Street Address" wide><input value={form.addressStreet} disabled={!editingSections.address} onChange={(e) => updateForm('addressStreet', e.target.value)} /></Field>
                    <div className="employee-profile-form-grid quarters">
                        <Field label="City"><input value={form.addressCity} disabled={!editingSections.address} onChange={(e) => updateForm('addressCity', e.target.value)} /></Field>
                        <Field label="State / Province"><input value={form.addressState} disabled={!editingSections.address} onChange={(e) => updateForm('addressState', e.target.value)} /></Field>
                        <Field label="ZIP / Postal Code"><input value={form.addressPostalCode} disabled={!editingSections.address} onChange={(e) => updateForm('addressPostalCode', e.target.value)} /></Field>
                        <Field label="Country"><input value={form.addressCountry} disabled={!editingSections.address} onChange={(e) => updateForm('addressCountry', e.target.value)} /></Field>
                    </div>
                </Panel>
                </div>

                <div className="employee-profile-column">
                <Panel
                    title="Emergency Contact"
                    editing={editingSections.emergency}
                    saving={saving}
                    changed={sectionChanged('emergency')}
                    onEdit={() => setSectionEditing('emergency', true)}
                    onCancel={() => cancelSection('emergency')}
                    onSave={() => saveProfile(null, 'emergency')}
                >
                    <div className="employee-profile-form-grid">
                        <Field label="Contact Name"><input value={form.emergencyContactName} disabled={!editingSections.emergency} onChange={(e) => updateForm('emergencyContactName', e.target.value)} /></Field>
                        <Field label="Relationship"><input value={form.emergencyRelationship} disabled={!editingSections.emergency} onChange={(e) => updateForm('emergencyRelationship', e.target.value)} /></Field>
                        <Field label="Phone Number"><input value={form.emergencyPhoneNumber} disabled={!editingSections.emergency} onChange={(e) => updateForm('emergencyPhoneNumber', e.target.value)} /></Field>
                        <Field label="Email Address"><input type="email" value={form.emergencyEmail} disabled={!editingSections.emergency} onChange={(e) => updateForm('emergencyEmail', e.target.value)} /></Field>
                        <Field label="Address" wide><input value={form.emergencyAddress} disabled={!editingSections.emergency} onChange={(e) => updateForm('emergencyAddress', e.target.value)} /></Field>
                    </div>
                </Panel>

                <Panel
                    title="Notification Preferences"
                    editing={editingSections.notifications}
                    saving={saving}
                    changed={sectionChanged('notifications')}
                    onEdit={() => setSectionEditing('notifications', true)}
                    onCancel={() => cancelSection('notifications')}
                    onSave={() => saveProfile(null, 'notifications')}
                >
                    <p className="employee-profile-panel-copy">Choose how you would like to receive notifications from the system.</p>
                    <div className="employee-profile-toggle-list">
                        <ToggleRow label="Email Notifications" description="Receive important updates and alerts via email." checked={prefs.emailNotifications} disabled={!editingSections.notifications} onChange={(value) => updatePrefs('emailNotifications', value)} />
                        <ToggleRow label="SMS Notifications" description="Receive text messages for critical alerts and updates." checked={prefs.smsNotifications} disabled={!editingSections.notifications} onChange={(value) => updatePrefs('smsNotifications', value)} />
                        <ToggleRow label="System Announcements" description="Receive announcements about updates and maintenance." checked={prefs.systemAnnouncements} disabled={!editingSections.notifications} onChange={(value) => updatePrefs('systemAnnouncements', value)} />
                        <ToggleRow label="Marketing & Product Updates" description="Receive occasional updates about new features and improvements." checked={prefs.marketingUpdates} disabled={!editingSections.notifications} onChange={(value) => updatePrefs('marketingUpdates', value)} />
                    </div>
                </Panel>
                </div>
            </div>

            {message ? <div className="employee-profile-toast success">{message}</div> : null}
            {error ? <div className="employee-profile-toast error">{error}</div> : null}
        </form>
    );
}

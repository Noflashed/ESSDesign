import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Check, ChevronDown, Mail, Phone } from 'lucide-react';
import { analysisAPI, preferencesAPI, usersAPI } from '../services/api';

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

function formatPhoneNumber(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

function parseAddressFallback(address = '') {
    const parts = String(address).split(',').map((part) => part.trim()).filter(Boolean);
    const regionPart = parts.find((part) => /\b[A-Z]{2,3}\b\s+\d{4}\b/.test(part)) || '';
    const regionMatch = regionPart.match(/\b([A-Z]{2,3})\b\s+(\d{4})\b/);

    return {
        street: parts[0] || address,
        city: parts[1] || '',
        state: regionMatch?.[1] || '',
        postcode: regionMatch?.[2] || '',
        country: parts.find((part) => /australia/i.test(part)) || 'Australia'
    };
}

function buildForm(user) {
    const name = splitName(user?.fullName || '');
    const streetAddress = user?.addressStreet || user?.personalAddress || '';

    return {
        firstName: name.firstName,
        lastName: name.lastName,
        preferredName: user?.preferredName || name.firstName,
        dateOfBirth: formatInputDate(user?.dateOfBirth),
        gender: user?.gender || '',
        employeeId: user?.employeeId || user?.id || '',
        phoneNumber: formatPhoneNumber(user?.phoneNumber || user?.employeePhoneNumber || ''),
        email: user?.email || '',
        personalAddress: streetAddress,
        addressStreet: streetAddress,
        addressCity: user?.addressCity || '',
        addressState: user?.addressState || '',
        addressPostalCode: user?.addressPostalCode || '',
        addressCountry: user?.addressCountry || 'Australia',
        emergencyContactName: user?.emergencyContactName || '',
        emergencyRelationship: user?.emergencyRelationship || '',
        emergencyPhoneNumber: formatPhoneNumber(user?.emergencyPhoneNumber || ''),
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

const CREDENTIAL_CONFIG = [
    {
        type: 'white_card',
        title: 'White Card',
        description: 'General construction induction card',
        numberLabel: 'White Card Number',
        showClasses: false,
        showExpiry: false
    },
    {
        type: 'driver_licence',
        title: 'Driver Licence',
        description: 'Australian driver licence details',
        numberLabel: 'Licence Number',
        showClasses: true,
        showExpiry: true
    },
    {
        type: 'high_risk_work_licence',
        title: 'High Risk Work Licence',
        description: 'SafeWork high risk work licence',
        numberLabel: 'Licence Number',
        showClasses: true,
        showExpiry: true
    }
];

const AUSTRALIAN_STATES = ['NSW', 'ACT', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT'];

function buildCredentialForm(credential = null) {
    return {
        credentialNumber: credential?.credentialNumber || '',
        licenceClasses: credential?.licenceClasses || '',
        issuingState: credential?.issuingState || 'NSW',
        issueDate: formatInputDate(credential?.issueDate),
        expiryDate: formatInputDate(credential?.expiryDate)
    };
}

function formatCredentialDate(value) {
    if (!value) return 'Not provided';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not provided';
    return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function CredentialCard({
    config,
    credential,
    form,
    editing,
    saving,
    selectedFile,
    onEdit,
    onCancel,
    onChange,
    onFileChange,
    onSave
}) {
    return (
        <article className={`employee-credential-card${credential ? ' complete' : ''}`}>
            <div className="employee-credential-card-head">
                <div>
                    <h4>{config.title}</h4>
                    <p>{config.description}</p>
                </div>
                <span className={`employee-credential-status ${credential ? 'complete' : 'missing'}`}>
                    {credential ? 'Added' : 'Required'}
                </span>
            </div>

            {editing ? (
                <div className="employee-credential-editor">
                    <div className="employee-profile-form-grid">
                        <Field label={config.numberLabel}>
                            <input
                                value={form.credentialNumber}
                                onChange={(event) => onChange('credentialNumber', event.target.value)}
                                disabled={saving}
                            />
                        </Field>
                        <Field label="Issuing State / Territory">
                            <span className="employee-profile-select-wrap">
                                <select value={form.issuingState} onChange={(event) => onChange('issuingState', event.target.value)} disabled={saving}>
                                    {AUSTRALIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                                </select>
                                <ChevronDown size={16} />
                            </span>
                        </Field>
                        {config.showClasses ? (
                            <Field label="Licence Class(es)" wide>
                                <input
                                    value={form.licenceClasses}
                                    onChange={(event) => onChange('licenceClasses', event.target.value)}
                                    placeholder={config.type === 'driver_licence' ? 'e.g. C, MR, HR' : 'e.g. SB, SI, DG'}
                                    disabled={saving}
                                />
                            </Field>
                        ) : null}
                        <Field label="Issue Date">
                            <input type="date" value={form.issueDate} onChange={(event) => onChange('issueDate', event.target.value)} disabled={saving} />
                        </Field>
                        {config.showExpiry ? (
                            <Field label="Expiry Date">
                                <input type="date" value={form.expiryDate} onChange={(event) => onChange('expiryDate', event.target.value)} disabled={saving} />
                            </Field>
                        ) : null}
                    </div>

                    <label className={`employee-credential-upload${selectedFile || credential?.hasFrontImage ? ' has-file' : ''}`}>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                            capture="environment"
                            onChange={onFileChange}
                            disabled={saving}
                        />
                        <strong>{selectedFile ? selectedFile.name : credential?.hasFrontImage ? 'Replace front image' : 'Upload front image *'}</strong>
                        <span>Take a clear photo or select a JPEG, PNG, WebP, HEIC or HEIF image up to 10 MB.</span>
                    </label>

                    <div className="employee-credential-actions">
                        <button type="button" className="employee-profile-panel-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
                        <button type="button" className="employee-profile-panel-primary" onClick={onSave} disabled={saving}>
                            {saving ? 'Saving...' : 'Save credential'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="employee-credential-details">
                        <span><small>{config.numberLabel}</small><strong>{credential?.credentialNumber || 'Not provided'}</strong></span>
                        <span><small>Issuing State</small><strong>{credential?.issuingState || 'Not provided'}</strong></span>
                        {config.showClasses ? <span><small>Class(es)</small><strong>{credential?.licenceClasses || 'Not provided'}</strong></span> : null}
                        <span><small>Issue Date</small><strong>{formatCredentialDate(credential?.issueDate)}</strong></span>
                        {config.showExpiry ? <span><small>Expiry Date</small><strong>{formatCredentialDate(credential?.expiryDate)}</strong></span> : null}
                    </div>

                    {credential?.frontImageUrl ? (
                        <a className="employee-credential-image" href={credential.frontImageUrl} target="_blank" rel="noreferrer">
                            <img src={credential.frontImageUrl} alt={`Front of ${config.title}`} />
                            <span>View front image</span>
                        </a>
                    ) : (
                        <div className="employee-credential-image empty">Front image required</div>
                    )}

                    <button type="button" className="employee-profile-panel-edit employee-credential-edit" onClick={onEdit}>
                        {credential ? 'Edit credential' : 'Add credential'}
                    </button>
                </>
            )}
        </article>
    );
}

const SECTION_KEYS = ['personal', 'emergency', 'notifications', 'address'];

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
    const [addressSuggestions, setAddressSuggestions] = useState([]);
    const [addressLoading, setAddressLoading] = useState(false);
    const [selectedAddressSourceId, setSelectedAddressSourceId] = useState('');
    const [emergencyAddressSuggestions, setEmergencyAddressSuggestions] = useState([]);
    const [emergencyAddressLoading, setEmergencyAddressLoading] = useState(false);
    const [selectedEmergencyAddressSourceId, setSelectedEmergencyAddressSourceId] = useState('');
    const [editingSections, setEditingSections] = useState(() => Object.fromEntries(SECTION_KEYS.map((key) => [key, false])));
    const [credentials, setCredentials] = useState([]);
    const [credentialForms, setCredentialForms] = useState(() => Object.fromEntries(CREDENTIAL_CONFIG.map(({ type }) => [type, buildCredentialForm()])));
    const [credentialFiles, setCredentialFiles] = useState({});
    const [editingCredential, setEditingCredential] = useState('');
    const [credentialsLoading, setCredentialsLoading] = useState(true);
    const [savingCredential, setSavingCredential] = useState('');
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
        setCredentialsLoading(true);
        usersAPI.getMyCredentials()
            .then((rows) => {
                if (!active) return;
                const nextCredentials = Array.isArray(rows) ? rows : [];
                setCredentials(nextCredentials);
                setCredentialForms(Object.fromEntries(CREDENTIAL_CONFIG.map(({ type }) => [
                    type,
                    buildCredentialForm(nextCredentials.find((item) => item.credentialType === type))
                ])));
            })
            .catch((credentialError) => {
                if (active) setError(credentialError.response?.data?.error || credentialError.message || 'Unable to load licence details.');
            })
            .finally(() => {
                if (active) setCredentialsLoading(false);
            });

        return () => { active = false; };
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

    useEffect(() => {
        const query = form.addressStreet.trim();
        if (!editingSections.address || selectedAddressSourceId || query.length < 3) {
            setAddressSuggestions([]);
            setAddressLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setAddressLoading(true);
            analysisAPI.addressSuggestions(query, { signal: controller.signal })
                .then((remoteResults) => {
                    const suggestions = (Array.isArray(remoteResults) ? remoteResults : [])
                        .map((item, index) => ({
                            id: `employee-address-${item.address || item.label || index}`,
                            label: item.label || item.address,
                            address: item.address || item.label,
                            lat: item.lat,
                            lon: item.lon,
                            source: 'TomTom'
                        }))
                        .filter((item) => item.address);
                    setAddressSuggestions(suggestions.slice(0, 6));
                })
                .catch((addressError) => {
                    if (addressError?.name !== 'CanceledError' && addressError?.code !== 'ERR_CANCELED') {
                        setAddressSuggestions([]);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setAddressLoading(false);
                    }
                });
        }, 120);

        setAddressLoading(true);
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [editingSections.address, form.addressStreet, selectedAddressSourceId]);

    useEffect(() => {
        const query = form.emergencyAddress.trim();
        if (!editingSections.emergency || selectedEmergencyAddressSourceId || query.length < 3) {
            setEmergencyAddressSuggestions([]);
            setEmergencyAddressLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setEmergencyAddressLoading(true);
            analysisAPI.addressSuggestions(query, { signal: controller.signal })
                .then((remoteResults) => {
                    const suggestions = (Array.isArray(remoteResults) ? remoteResults : [])
                        .map((item, index) => ({
                            id: `employee-emergency-address-${item.address || item.label || index}`,
                            label: item.label || item.address,
                            address: item.address || item.label,
                            lat: item.lat,
                            lon: item.lon,
                            source: 'TomTom'
                        }))
                        .filter((item) => item.address);
                    setEmergencyAddressSuggestions(suggestions.slice(0, 6));
                })
                .catch((addressError) => {
                    if (addressError?.name !== 'CanceledError' && addressError?.code !== 'ERR_CANCELED') {
                        setEmergencyAddressSuggestions([]);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setEmergencyAddressLoading(false);
                    }
                });
        }, 120);

        setEmergencyAddressLoading(true);
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [editingSections.emergency, form.emergencyAddress, selectedEmergencyAddressSourceId]);

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

    const updatePhoneField = (key, value) => {
        updateForm(key, formatPhoneNumber(value));
    };

    const updateStreetAddress = (value) => {
        setSelectedAddressSourceId('');
        setForm((current) => ({ ...current, addressStreet: value, personalAddress: value }));
        setMessage('');
        setError('');
    };

    const selectAddressSuggestion = async (suggestion) => {
        const fallback = parseAddressFallback(suggestion.address);
        let details = null;
        if (suggestion.lat != null && suggestion.lon != null) {
            try {
                details = await analysisAPI.reverseGeocode({ lat: suggestion.lat, lon: suggestion.lon });
            } catch {
                details = null;
            }
        }

        const street = /\d/.test(fallback.street) ? fallback.street : (details?.street || fallback.street);
        const city = details?.suburb || details?.municipality || fallback.city;
        const state = details?.state || fallback.state;
        const postcode = details?.postcode || fallback.postcode;
        const country = fallback.country || form.addressCountry || 'Australia';

        setForm((current) => ({
            ...current,
            personalAddress: suggestion.address,
            addressStreet: street,
            addressCity: city,
            addressState: state,
            addressPostalCode: postcode,
            addressCountry: country
        }));
        setSelectedAddressSourceId(suggestion.id);
        setAddressSuggestions([]);
        setAddressLoading(false);
        setMessage('');
        setError('');
    };

    const updateEmergencyAddress = (value) => {
        setSelectedEmergencyAddressSourceId('');
        updateForm('emergencyAddress', value);
    };

    const selectEmergencyAddressSuggestion = (suggestion) => {
        setForm((current) => ({ ...current, emergencyAddress: suggestion.address }));
        setSelectedEmergencyAddressSourceId(suggestion.id);
        setEmergencyAddressSuggestions([]);
        setEmergencyAddressLoading(false);
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
        if (section === 'address') {
            setAddressSuggestions([]);
            setAddressLoading(false);
            setSelectedAddressSourceId('');
        }
        if (section === 'emergency') {
            setEmergencyAddressSuggestions([]);
            setEmergencyAddressLoading(false);
            setSelectedEmergencyAddressSourceId('');
        }
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
            personal: ['firstName', 'lastName', 'preferredName', 'dateOfBirth', 'gender', 'phoneNumber', 'email'],
            emergency: ['emergencyContactName', 'emergencyRelationship', 'emergencyPhoneNumber', 'emergencyEmail', 'emergencyAddress'],
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
                personalAddress: form.personalAddress || form.addressStreet,
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

    const findCredential = (credentialType) => credentials.find((item) => item.credentialType === credentialType) || null;

    const editCredential = (credentialType) => {
        setCredentialForms((current) => ({
            ...current,
            [credentialType]: buildCredentialForm(findCredential(credentialType))
        }));
        setCredentialFiles((current) => ({ ...current, [credentialType]: null }));
        setEditingCredential(credentialType);
        setMessage('');
        setError('');
    };

    const cancelCredentialEdit = (credentialType) => {
        setCredentialForms((current) => ({
            ...current,
            [credentialType]: buildCredentialForm(findCredential(credentialType))
        }));
        setCredentialFiles((current) => ({ ...current, [credentialType]: null }));
        setEditingCredential('');
    };

    const updateCredentialForm = (credentialType, key, value) => {
        setCredentialForms((current) => ({
            ...current,
            [credentialType]: { ...current[credentialType], [key]: value }
        }));
        setMessage('');
        setError('');
    };

    const selectCredentialFile = (credentialType, event) => {
        const file = event.target.files?.[0] || null;
        setCredentialFiles((current) => ({ ...current, [credentialType]: file }));
        setMessage('');
        setError('');
    };

    const saveCredential = async (credentialType) => {
        const credential = findCredential(credentialType);
        const credentialForm = credentialForms[credentialType];
        const frontImage = credentialFiles[credentialType] || null;
        if (!credentialForm?.credentialNumber?.trim()) {
            setError('Credential number is required.');
            return;
        }
        if (!credential?.hasFrontImage && !frontImage) {
            setError('A photo of the front of the credential is required.');
            return;
        }
        if (frontImage && frontImage.size > 10 * 1024 * 1024) {
            setError('Credential image must not exceed 10 MB.');
            return;
        }

        setSavingCredential(credentialType);
        setMessage('');
        setError('');
        try {
            const saved = await usersAPI.saveMyCredential(credentialType, credentialForm, frontImage);
            setCredentials((current) => [...current.filter((item) => item.credentialType !== credentialType), saved]);
            setCredentialForms((current) => ({ ...current, [credentialType]: buildCredentialForm(saved) }));
            setCredentialFiles((current) => ({ ...current, [credentialType]: null }));
            setEditingCredential('');
            setMessage(`${CREDENTIAL_CONFIG.find((item) => item.type === credentialType)?.title || 'Credential'} saved successfully.`);
        } catch (credentialError) {
            setError(credentialError.response?.data?.error || credentialError.message || 'Unable to save credential.');
        } finally {
            setSavingCredential('');
        }
    };

    return (
        <form className="employee-profile-page" onSubmit={saveProfile}>
            <section className="employee-profile-summary">
                <div className="employee-profile-summary-main">
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
                            {uploadingPhoto ? 'Uploading photo...' : 'Update photo'}
                        </button>
                    </div>

                    <div className="employee-profile-identity">
                        <span className="employee-profile-kicker">Employee profile</span>
                        <h2>{fullName || 'Your name'}</h2>
                        <div className="employee-profile-title-row">
                            <span><Briefcase size={15} /> {roleLabel}</span>
                            <span className="employee-profile-verified"><Check size={15} /> Verified</span>
                        </div>
                        <div className="employee-profile-contact-chips">
                            <span><Phone size={14} /> {form.phoneNumber || 'No phone saved'}</span>
                            <span><Mail size={14} /> {form.email || 'No email saved'}</span>
                        </div>
                    </div>

                </div>

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
                        <Field label="Phone Number"><input value={form.phoneNumber} disabled={!editingSections.personal} onChange={(e) => updatePhoneField('phoneNumber', e.target.value)} placeholder="0422 374 448" inputMode="numeric" /></Field>
                        <Field label="Email Address"><input type="email" value={form.email} disabled={!editingSections.personal} onChange={(e) => updateForm('email', e.target.value)} required /></Field>
                    </div>
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
                    <Field label="Street Address" wide>
                        <div className="employee-profile-address-autocomplete">
                            <input
                                value={form.addressStreet}
                                disabled={!editingSections.address}
                                onChange={(e) => updateStreetAddress(e.target.value)}
                                placeholder="Start typing an address..."
                                autoComplete="off"
                            />
                            {editingSections.address && (addressLoading || addressSuggestions.length > 0) ? (
                                <div className="employee-profile-address-suggestions" role="listbox">
                                    {addressSuggestions.map((suggestion) => (
                                        <button
                                            key={suggestion.id}
                                            type="button"
                                            className="employee-profile-address-suggestion"
                                            onClick={() => selectAddressSuggestion(suggestion)}
                                            role="option"
                                        >
                                            <strong>{suggestion.address}</strong>
                                            <span>{suggestion.source}{suggestion.label && suggestion.label !== suggestion.address ? ` - ${suggestion.label}` : ''}</span>
                                        </button>
                                    ))}
                                    {addressLoading ? <div className="employee-profile-address-suggestion loading">Searching addresses...</div> : null}
                                </div>
                            ) : null}
                        </div>
                    </Field>
                    <div className="employee-profile-address-hint">
                        Select a suggested address where possible.
                    </div>
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
                        <Field label="Phone Number"><input value={form.emergencyPhoneNumber} disabled={!editingSections.emergency} onChange={(e) => updatePhoneField('emergencyPhoneNumber', e.target.value)} placeholder="0422 374 448" inputMode="numeric" /></Field>
                        <Field label="Email Address"><input type="email" value={form.emergencyEmail} disabled={!editingSections.emergency} onChange={(e) => updateForm('emergencyEmail', e.target.value)} /></Field>
                        <Field label="Address" wide>
                            <div className="employee-profile-address-autocomplete">
                                <input
                                    value={form.emergencyAddress}
                                    disabled={!editingSections.emergency}
                                    onChange={(e) => updateEmergencyAddress(e.target.value)}
                                    placeholder="Start typing an address..."
                                    autoComplete="off"
                                />
                                {editingSections.emergency && (emergencyAddressLoading || emergencyAddressSuggestions.length > 0) ? (
                                    <div className="employee-profile-address-suggestions" role="listbox">
                                        {emergencyAddressSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion.id}
                                                type="button"
                                                className="employee-profile-address-suggestion"
                                                onClick={() => selectEmergencyAddressSuggestion(suggestion)}
                                                role="option"
                                            >
                                                <strong>{suggestion.address}</strong>
                                                <span>{suggestion.source}{suggestion.label && suggestion.label !== suggestion.address ? ` - ${suggestion.label}` : ''}</span>
                                            </button>
                                        ))}
                                        {emergencyAddressLoading ? <div className="employee-profile-address-suggestion loading">Searching addresses...</div> : null}
                                    </div>
                                ) : null}
                            </div>
                        </Field>
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

            <section className="employee-profile-panel employee-credentials-panel">
                <div className="employee-credentials-heading">
                    <div>
                        <h3>Licences &amp; Credentials</h3>
                        <p>Add the details shown on each credential and upload a clear photo of its front.</p>
                    </div>
                    <span>{credentials.length} of {CREDENTIAL_CONFIG.length} added</span>
                </div>

                {credentialsLoading ? (
                    <div className="employee-credentials-loading">Loading licence details...</div>
                ) : (
                    <div className="employee-credentials-grid">
                        {CREDENTIAL_CONFIG.map((config) => (
                            <CredentialCard
                                key={config.type}
                                config={config}
                                credential={findCredential(config.type)}
                                form={credentialForms[config.type] || buildCredentialForm()}
                                editing={editingCredential === config.type}
                                saving={savingCredential === config.type}
                                selectedFile={credentialFiles[config.type] || null}
                                onEdit={() => editCredential(config.type)}
                                onCancel={() => cancelCredentialEdit(config.type)}
                                onChange={(key, value) => updateCredentialForm(config.type, key, value)}
                                onFileChange={(event) => selectCredentialFile(config.type, event)}
                                onSave={() => saveCredential(config.type)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {message ? <div className="employee-profile-toast success">{message}</div> : null}
            {error ? <div className="employee-profile-toast error">{error}</div> : null}
        </form>
    );
}

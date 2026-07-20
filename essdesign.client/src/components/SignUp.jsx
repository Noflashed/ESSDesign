import React, { useEffect, useMemo, useState } from 'react';
import { authAPI } from '../services/api';
import AuthShell from './AuthShell';
import './Auth.css';

const STEPS = [
    { key: 'personal', label: 'Personal' },
    { key: 'address', label: 'Address' },
    { key: 'emergency', label: 'Emergency' },
    { key: 'security', label: 'Account' }
];

const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

function SignUp({
    onSignUpSuccess,
    onSwitchToLogin,
    initialEmail = '',
    initialFirstName = '',
    initialLastName = '',
    employeeId = ''
}) {
    const [step, setStep] = useState(0);
    const [formData, setFormData] = useState({
        firstName: initialFirstName,
        lastName: initialLastName,
        preferredName: '',
        email: initialEmail,
        phoneNumber: '',
        dateOfBirth: '',
        gender: '',
        addressStreet: '',
        addressCity: '',
        addressState: '',
        addressPostalCode: '',
        addressCountry: 'Australia',
        emergencyContactName: '',
        emergencyRelationship: '',
        emergencyPhoneNumber: '',
        emergencyEmail: '',
        emergencyAddress: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setFormData((current) => ({
            ...current,
            firstName: initialFirstName || current.firstName,
            lastName: initialLastName || current.lastName,
            email: initialEmail || current.email
        }));
    }, [initialEmail, initialFirstName, initialLastName]);

    const isEmployeeInvite = Boolean(employeeId && initialEmail);
    const maxBirthDate = useMemo(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().slice(0, 10);
    }, []);

    const updateField = (event) => {
        const { name, value } = event.target;
        setFormData((current) => ({ ...current, [name]: value }));
        setError('');
    };

    const validateStep = (stepIndex) => {
        if (stepIndex === 0) {
            if (!formData.firstName.trim() || !formData.lastName.trim()) return 'Enter your first and last name.';
            if (!formData.email.trim() || !formData.email.includes('@')) return 'Enter a valid work email address.';
            if (!formData.phoneNumber.trim()) return 'Enter your phone number.';
            if (!formData.dateOfBirth) return 'Enter your date of birth.';
            if (!formData.gender) return 'Select a gender option.';
        }
        if (stepIndex === 1) {
            if (!formData.addressStreet.trim() || !formData.addressCity.trim() || !formData.addressState.trim()
                || !formData.addressPostalCode.trim() || !formData.addressCountry.trim()) {
                return 'Complete every field in your residential address.';
            }
        }
        if (stepIndex === 2) {
            if (!formData.emergencyContactName.trim() || !formData.emergencyRelationship.trim()
                || !formData.emergencyPhoneNumber.trim()) {
                return 'Provide an emergency contact name, relationship, and phone number.';
            }
            if (formData.emergencyEmail && !formData.emergencyEmail.includes('@')) {
                return 'Enter a valid emergency contact email address.';
            }
        }
        if (stepIndex === 3) {
            if (formData.password.length < 8) return 'Password must be at least 8 characters.';
            if (formData.password !== formData.confirmPassword) return 'Passwords do not match.';
        }
        return '';
    };

    const goToNextStep = () => {
        const validationMessage = validateStep(step);
        if (validationMessage) {
            setError(validationMessage);
            return;
        }
        setError('');
        setStep((current) => Math.min(current + 1, STEPS.length - 1));
        window.scrollTo?.({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (step < STEPS.length - 1) {
            goToNextStep();
            return;
        }

        const validationMessage = validateStep(step);
        if (validationMessage) {
            setError(validationMessage);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`;
            await authAPI.signUp({
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                fullName,
                preferredName: formData.preferredName.trim() || null,
                phoneNumber: formData.phoneNumber.trim(),
                dateOfBirth: formData.dateOfBirth,
                gender: formData.gender,
                addressStreet: formData.addressStreet.trim(),
                addressCity: formData.addressCity.trim(),
                addressState: formData.addressState.trim(),
                addressPostalCode: formData.addressPostalCode.trim(),
                addressCountry: formData.addressCountry.trim(),
                emergencyContactName: formData.emergencyContactName.trim(),
                emergencyRelationship: formData.emergencyRelationship.trim(),
                emergencyPhoneNumber: formData.emergencyPhoneNumber.trim(),
                emergencyEmail: formData.emergencyEmail.trim() || null,
                emergencyAddress: formData.emergencyAddress.trim() || null,
                employeeId: employeeId || null
            });
            onSignUpSuccess?.(formData.email.trim());
        } catch (err) {
            setError(err.response?.data?.error || 'We could not create your account. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            eyebrow={isEmployeeInvite ? 'Employee invitation' : 'New account'}
            title={isEmployeeInvite ? 'Complete your employee profile' : 'Set up your ESS profile'}
            description="We’ll collect the details required for your employee record before securing your account."
            size="wide"
            footer={(
                <span>Already registered? <button type="button" className="auth-text-button" onClick={onSwitchToLogin}>Sign in</button></span>
            )}
        >
            <nav className="auth-stepper" aria-label="Registration progress">
                {STEPS.map((item, index) => (
                    <button
                        key={item.key}
                        type="button"
                        className={`${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`}
                        onClick={() => { if (index < step) { setStep(index); setError(''); } }}
                        disabled={index > step}
                        aria-current={index === step ? 'step' : undefined}
                    >
                        <span>{index < step ? '✓' : index + 1}</span>
                        <small>{item.label}</small>
                    </button>
                ))}
            </nav>

            <form onSubmit={handleSubmit} className="auth-form auth-onboarding-form">
                {step === 0 ? (
                    <fieldset className="auth-form-section">
                        <legend>Personal information</legend>
                        <p>This information becomes the core of your employee profile.</p>
                        <div className="auth-field-grid two-columns">
                            <div className="auth-field">
                                <label htmlFor="signup-first-name">First name <b>*</b></label>
                                <input id="signup-first-name" name="firstName" value={formData.firstName} onChange={updateField} disabled={isEmployeeInvite && Boolean(initialFirstName)} autoComplete="given-name" autoFocus required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-last-name">Last name <b>*</b></label>
                                <input id="signup-last-name" name="lastName" value={formData.lastName} onChange={updateField} disabled={isEmployeeInvite && Boolean(initialLastName)} autoComplete="family-name" required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-preferred-name">Preferred name <span>Optional</span></label>
                                <input id="signup-preferred-name" name="preferredName" value={formData.preferredName} onChange={updateField} autoComplete="nickname" />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-phone">Mobile number <b>*</b></label>
                                <input id="signup-phone" type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={updateField} placeholder="04xx xxx xxx" autoComplete="tel" required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-dob">Date of birth <b>*</b></label>
                                <input id="signup-dob" type="date" name="dateOfBirth" value={formData.dateOfBirth} max={maxBirthDate} onChange={updateField} autoComplete="bday" required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-gender">Gender <b>*</b></label>
                                <select id="signup-gender" name="gender" value={formData.gender} onChange={updateField} required>
                                    <option value="">Select an option</option>
                                    <option value="female">Female</option>
                                    <option value="male">Male</option>
                                    <option value="non_binary">Non-binary</option>
                                    <option value="self_described">Self-described</option>
                                    <option value="prefer_not_to_say">Prefer not to say</option>
                                </select>
                            </div>
                            <div className="auth-field full-width">
                                <label htmlFor="signup-email">Work email <b>*</b></label>
                                <input id="signup-email" type="email" name="email" value={formData.email} onChange={updateField} disabled={isEmployeeInvite} autoComplete="email" required />
                                {isEmployeeInvite ? <small className="auth-field-note">This email is secured to your employee invitation.</small> : null}
                            </div>
                        </div>
                    </fieldset>
                ) : null}

                {step === 1 ? (
                    <fieldset className="auth-form-section">
                        <legend>Residential address</legend>
                        <p>Used for your private employee record and emergency administration.</p>
                        <div className="auth-field-grid two-columns">
                            <div className="auth-field full-width">
                                <label htmlFor="signup-street">Street address <b>*</b></label>
                                <input id="signup-street" name="addressStreet" value={formData.addressStreet} onChange={updateField} placeholder="Street number and name" autoComplete="street-address" autoFocus required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-city">Suburb / city <b>*</b></label>
                                <input id="signup-city" name="addressCity" value={formData.addressCity} onChange={updateField} autoComplete="address-level2" required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-state">State / territory <b>*</b></label>
                                <select id="signup-state" name="addressState" value={formData.addressState} onChange={updateField} autoComplete="address-level1" required>
                                    <option value="">Select state</option>
                                    {AUSTRALIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                                </select>
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-postcode">Postcode <b>*</b></label>
                                <input id="signup-postcode" name="addressPostalCode" value={formData.addressPostalCode} onChange={updateField} inputMode="numeric" autoComplete="postal-code" required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-country">Country <b>*</b></label>
                                <input id="signup-country" name="addressCountry" value={formData.addressCountry} onChange={updateField} autoComplete="country-name" required />
                            </div>
                        </div>
                    </fieldset>
                ) : null}

                {step === 2 ? (
                    <fieldset className="auth-form-section">
                        <legend>Emergency contact</legend>
                        <p>Provide the person ESS should contact in an emergency.</p>
                        <div className="auth-field-grid two-columns">
                            <div className="auth-field">
                                <label htmlFor="signup-emergency-name">Contact name <b>*</b></label>
                                <input id="signup-emergency-name" name="emergencyContactName" value={formData.emergencyContactName} onChange={updateField} autoComplete="off" autoFocus required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-relationship">Relationship <b>*</b></label>
                                <input id="signup-relationship" name="emergencyRelationship" value={formData.emergencyRelationship} onChange={updateField} placeholder="e.g. Partner, parent" autoComplete="off" required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-emergency-phone">Phone number <b>*</b></label>
                                <input id="signup-emergency-phone" type="tel" name="emergencyPhoneNumber" value={formData.emergencyPhoneNumber} onChange={updateField} autoComplete="off" required />
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-emergency-email">Email <span>Optional</span></label>
                                <input id="signup-emergency-email" type="email" name="emergencyEmail" value={formData.emergencyEmail} onChange={updateField} autoComplete="off" />
                            </div>
                            <div className="auth-field full-width">
                                <label htmlFor="signup-emergency-address">Address <span>Optional</span></label>
                                <input id="signup-emergency-address" name="emergencyAddress" value={formData.emergencyAddress} onChange={updateField} autoComplete="off" />
                            </div>
                        </div>
                    </fieldset>
                ) : null}

                {step === 3 ? (
                    <fieldset className="auth-form-section">
                        <legend>Secure your account</legend>
                        <p>Create your password and review the employee record that will be submitted.</p>
                        <div className="auth-review-card">
                            <div><span>Employee</span><strong>{formData.firstName} {formData.lastName}</strong></div>
                            <div><span>Contact</span><strong>{formData.email}<br />{formData.phoneNumber}</strong></div>
                            <div><span>Address</span><strong>{formData.addressStreet}, {formData.addressCity} {formData.addressState} {formData.addressPostalCode}</strong></div>
                            <div><span>Emergency contact</span><strong>{formData.emergencyContactName} · {formData.emergencyPhoneNumber}</strong></div>
                        </div>
                        <div className="auth-field-grid two-columns">
                            <div className="auth-field">
                                <label htmlFor="signup-password">Password <b>*</b></label>
                                <input id="signup-password" type="password" name="password" value={formData.password} onChange={updateField} autoComplete="new-password" minLength={8} autoFocus required />
                                <small className="auth-field-note">Use at least 8 characters.</small>
                            </div>
                            <div className="auth-field">
                                <label htmlFor="signup-confirm-password">Confirm password <b>*</b></label>
                                <input id="signup-confirm-password" type="password" name="confirmPassword" value={formData.confirmPassword} onChange={updateField} autoComplete="new-password" minLength={8} required />
                            </div>
                        </div>
                    </fieldset>
                ) : null}

                {error ? <div className="auth-alert auth-alert-error" role="alert">{error}</div> : null}

                <div className="auth-form-actions">
                    {step > 0 ? (
                        <button type="button" className="auth-secondary-button" onClick={() => { setStep((current) => current - 1); setError(''); }} disabled={loading}>Back</button>
                    ) : <span />}
                    <button type="submit" className="auth-primary-button" disabled={loading}>
                        {loading ? 'Creating account…' : step === STEPS.length - 1 ? 'Create account' : 'Continue'}
                    </button>
                </div>
            </form>
        </AuthShell>
    );
}

export default SignUp;

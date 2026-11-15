import { useRef, useState } from 'react'
import interviewerImage from './assets/ai-interviewer.jpeg'
import { supabase } from './supabase.js'

function newPasswordError(password) {
  if (!password.trim()) return 'Enter your password.'
  if (Array.from(password).length < 8) return 'Use at least 8 characters.'
  if (new TextEncoder().encode(password).length > 72) return 'Use a shorter password. Some characters take more space than others.'
  return ''
}

function validateAccount(form, isLogin) {
  const values = new FormData(form)
  const name = (values.get('name') ?? '').trim()
  const email = values.get('email').trim().toLowerCase()
  const password = values.get('password')
  const errors = {}

  if (!isLogin && (name.length < 2 || name.length > 80)) errors.name = 'Enter a name between 2 and 80 characters.'
  if (!email) errors.email = 'Enter your email address.'
  else if (email.length > 254 || form.elements.email.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'

  const passwordError = isLogin ? (!password.trim() && 'Enter your password.') : newPasswordError(password)
  if (passwordError) errors.password = passwordError

  if (!isLogin) {
    const confirmation = values.get('confirmation')
    if (!confirmation) errors.confirmation = 'Type your password again.'
    else if (confirmation !== password) errors.confirmation = 'The passwords do not match.'
  }
  return { errors, name, email, password }
}

function authMessage(error) {
  switch (error.code) {
    case 'invalid_credentials': return 'The email or password is incorrect.'
    case 'user_already_exists':
    case 'email_exists': return 'An account already exists for this email. Log in instead.'
    case 'email_not_confirmed': return 'This account could not be activated. Contact support.'
    case 'weak_password': return 'Choose a stronger password. Try a longer, unique passphrase.'
    case 'email_address_invalid': return 'Use a valid email address that can receive messages.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Too many attempts. Wait a little before trying again.'
    default: return 'We could not complete your request. Please try again.'
  }
}

const profileNameSegments = new Intl.Segmenter()

function ProfilePage({ user, loggingOut, onRequestLogout, onLogout }) {
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleted, setDeleted] = useState(false)
  const deleteDialog = useRef(null)
  const joined = new Date(user.created_at)
  const accountName = user.user_metadata?.full_name
  const displayName = (typeof accountName === 'string' && accountName.trim()) || 'Your profile'
  const initial = profileNameSegments.segment(displayName).containing(0).segment.toLocaleUpperCase()

  async function changePassword(event) {
    event.preventDefault()
    if (changingPassword || deleting) return
    const form = event.currentTarget
    const fields = new FormData(form)
    const currentPassword = fields.get('currentPassword')
    const password = fields.get('newPassword')
    const validationError = newPasswordError(password)
    if (validationError || password !== fields.get('confirmPassword') || password === currentPassword) {
      const text = validationError || (password === currentPassword
        ? 'Choose a password different from your current password.'
        : 'The new passwords do not match.')
      setPasswordStatus({ text, error: true })
      return
    }

    setChangingPassword(true)
    setPasswordStatus(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (signInError) {
        const text = signInError.code === 'invalid_credentials'
          ? 'Your current password is incorrect.'
          : authMessage(signInError)
        setPasswordStatus({ text, error: true })
        return
      }

      const { error } = await supabase.auth.updateUser({ password, current_password: currentPassword })
      if (error) {
        let text = authMessage(error)
        if (error.code === 'current_password_mismatch') text = 'Your current password is incorrect.'
        if (error.code === 'same_password') text = 'Choose a password different from your current password.'
        if (error.code === 'reauthentication_needed') text = 'Log out and log back in before changing your password.'
        setPasswordStatus({ text, error: true })
      } else {
        form.reset()
        setPasswordStatus({ text: 'Password updated.' })
      }
    } catch {
      setPasswordStatus({ text: 'Could not update your password. Please try again.', error: true })
    } finally {
      setChangingPassword(false)
    }
  }

  async function deleteAccount() {
    if (deleting || changingPassword) return
    setDeleting(true)
    setDeleteError('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setDeleteError('Log in again before deleting your account.')
        return
      }
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
      if (response.status !== 204) {
        const messages = {
          401: 'Log in again before deleting your account.',
          503: 'Account deletion is not available yet.',
        }
        setDeleteError(messages[response.status] || 'Could not delete your account. Please try again.')
        return
      }
    } catch {
      setDeleteError('Could not reach the account service. Please try again.')
      return
    } finally {
      setDeleting(false)
    }

    deleteDialog.current?.close()
    setDeleted(true)
    await onLogout()
  }

  if (deleted) {
    return (
      <section className="panel" aria-labelledby="profile-title">
        <h1 id="profile-title">Account deleted</h1>
        <button className="button button-outline" type="button" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? 'Signing out…' : 'Return to login'}
        </button>
      </section>
    )
  }

  return (
    <section className="panel wide-panel profile-page" aria-labelledby="profile-title">
      <header className="profile-page-header">
        <h1 id="profile-title">Account settings</h1>
        <a className="button button-outline profile-setup-link" href="#setup">Set up an interview <span aria-hidden="true">↗</span></a>
      </header>
      <div className="profile-settings">
        <section className="profile-surface profile-identity" aria-labelledby="profile-name">
          <div className="profile-cover" aria-hidden="true" />
          <div className="profile-identity-content">
            <span className="profile-avatar" aria-hidden="true">{initial}</span>
            <h2 id="profile-name">{displayName}</h2>
            <dl className="profile-details">
              <div><dt>Email address</dt><dd>{user.email}</dd></div>
              {!Number.isNaN(joined.getTime()) && (
                <div><dt>Member since</dt><dd>{joined.toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd></div>
              )}
            </dl>
            <button className="button button-outline profile-signout" type="button" disabled={loggingOut || deleting} onClick={onRequestLogout}>
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </section>
        <section className="profile-surface profile-security" aria-labelledby="profile-password-title">
          <h2 id="profile-password-title">Change password</h2>
          <form className="page-form profile-password-form" onSubmit={changePassword}>
            <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" placeholder="Enter your current password" required /></label>
            <div className="profile-password-fields">
              <label>New password<input name="newPassword" type="password" autoComplete="new-password" placeholder="Enter a new password" aria-describedby="profile-password-hint" required /></label>
              <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat your new password" required /></label>
            </div>
            <p className="profile-password-hint" id="profile-password-hint">Use at least 8 characters.</p>
            {passwordStatus && <p className={`form-status${passwordStatus.error ? ' account-error' : ''}`} role={passwordStatus.error ? 'alert' : 'status'}>{passwordStatus.text}</p>}
            <div className="profile-password-footer">
              <button className="button button-primary" type="submit" disabled={changingPassword || deleting || loggingOut}>
                {changingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      </div>
      <section className="profile-surface profile-delete">
        <div>
          <h2>Delete account</h2>
          <p>Permanently delete your InterviewLoop account. Published reviews will stay public.</p>
        </div>
        <button className="button button-danger" type="button" disabled={deleting || changingPassword || loggingOut} onClick={() => {
          setDeleteError('')
          deleteDialog.current.showModal()
        }}>Delete account</button>
      </section>
      <dialog className="review-dialog profile-delete-dialog" ref={deleteDialog} aria-labelledby="delete-account-title" onCancel={event => {
        if (deleting) event.preventDefault()
      }}>
        <h2 id="delete-account-title">Delete your account?</h2>
        <p>This action is permanent.</p>
        {deleteError && <p className="form-status account-error" role="alert">{deleteError}</p>}
        <div className="profile-delete-actions">
          <button className="button button-outline" type="button" disabled={deleting} onClick={() => deleteDialog.current.close()}>Cancel</button>
          <button className="button button-danger" type="button" disabled={deleting} onClick={deleteAccount}>{deleting ? 'Deleting…' : 'Delete account'}</button>
        </div>
      </dialog>
    </section>
  )
}

export function AccountPage({ mode, user, checkingSession, loggingOut, onRequestLogout, onLogout }) {
  const isLogin = mode !== 'register'
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const report = (text, error = false) => setMessage({ text, error })

  async function submitAccount(event) {
    event.preventDefault()
    if (submitting) return
    const form = event.currentTarget
    const { errors: nextErrors, name, email, password } = validateAccount(form, isLogin)
    setErrors(nextErrors)
    setMessage(null)
    const firstInvalid = Object.keys(nextErrors)[0]
    if (firstInvalid) {
      form.elements.namedItem(firstInvalid)?.focus()
      return
    }
    if (!supabase) return

    setSubmitting(true)
    try {
      const { data, error } = isLogin
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })

      if (error) {
        report(authMessage(error), true)
      } else if (data.session) {
        window.location.replace('#home')
      } else {
        report('We could not start your session. Contact support if the problem continues.', true)
      }
    } catch {
      report('Could not reach the account service. Check your connection and try again.', true)
    } finally {
      setSubmitting(false)
    }
  }

  function fieldStatus(name, hint) {
    return {
      'aria-invalid': errors[name] ? true : undefined,
      'aria-describedby': [hint, errors[name] && `account-${name}-error`].filter(Boolean).join(' ') || undefined,
    }
  }

  const fieldError = (name) => errors[name] && <small id={`account-${name}-error`} className="account-field-error">{errors[name]}</small>
  const feedback = message && <p className={`form-status${message.error ? ' account-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>

  if (user && !checkingSession) {
    return <ProfilePage user={user} loggingOut={loggingOut} onRequestLogout={onRequestLogout} onLogout={onLogout} />
  }

  return (
    <section className="panel account-panel" aria-labelledby="account-title">
      <div className="account-visual">
        <img src={interviewerImage} alt="An AI interviewer framed by cyan and violet audio displays" />
        <div className="account-visual-copy"><p>Practice for the job <em>you want.</em></p></div>
      </div>
      <div className="form-card account-card">
        {checkingSession ? (
          <h1 id="account-title">Checking your session…</h1>
        ) : (
          <>
            <nav className="account-nav" aria-label="Account">
              <a href="#login" aria-current={isLogin ? 'page' : undefined}>Login</a>
              <a href="#register" aria-current={isLogin ? undefined : 'page'}>Register</a>
            </nav>
            <h1 id="account-title">{isLogin ? 'Welcome back.' : 'Register'}</h1>
            <p className="panel-intro">{isLogin ? 'Sign in to return to your interview practice.' : 'Create a profile for your interview practice and progress.'}</p>
            {!supabase && <p className="form-status account-config" role="status">Account service is not configured yet.</p>}
            <form className="page-form" noValidate onSubmit={submitAccount} onChange={event => {
              const { name } = event.target
              setErrors(previous => ({ ...previous, [name]: undefined, ...(name === 'password' ? { confirmation: undefined } : {}) }))
            }}>
              {!isLogin && (
                <label>Full name
                  <input name="name" autoComplete="name" placeholder="Your full name" maxLength={80} required {...fieldStatus('name')} />
                  {fieldError('name')}
                </label>
              )}
              <label>Email address
                <input name="email" type="email" autoComplete={isLogin ? 'username' : 'email'} placeholder="you@example.com" maxLength={254} required {...fieldStatus('email')} />
                {fieldError('email')}
              </label>
              <div>
                <label htmlFor="account-password">Password</label>
                <div className="password-field">
                  <input id="account-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="Enter your password" required {...fieldStatus('password', isLogin ? undefined : 'account-password-hint')} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={`${showPassword ? 'Hide' : 'Show'} password${isLogin ? '' : 's'}`}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
                {!isLogin && <small className="account-field-hint" id="account-password-hint">Use at least 8 characters. A unique passphrase works well.</small>}
                {fieldError('password')}
              </div>
              {!isLogin && (
                <label>Confirm password
                  <input name="confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" required {...fieldStatus('confirmation')} />
                  {fieldError('confirmation')}
                </label>
              )}
              <button className="button button-primary form-submit" type="submit" disabled={submitting}>
                {submitting ? (isLogin ? 'Logging in…' : 'Creating account…') : (isLogin ? 'Log in' : 'Create account')}
              </button>
              {feedback}
            </form>
          </>
        )}
      </div>
    </section>
  )
}

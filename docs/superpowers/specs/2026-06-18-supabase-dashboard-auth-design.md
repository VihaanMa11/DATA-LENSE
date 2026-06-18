# Supabase Dashboard Authentication Design

## Objective

Protect the Data Lense MLH dashboard UI and all dashboard APIs with Supabase email/password authentication. Access is restricted to the single approved account `testw065@gmail.com`.

## Chosen Approach

Use server-managed Supabase Auth with secure HTTP-only cookies. The browser submits credentials only to the Node backend. The backend signs in through Supabase, validates the authenticated email against the allowlist, and stores the resulting Supabase access and refresh tokens in cookies that frontend JavaScript cannot read.

## Authentication Flow

1. On startup, the React app requests `GET /api/auth/session`.
2. If no valid authorized session exists, the app renders the login screen and does not request dashboard data.
3. The login form posts the entered email and password to `POST /api/auth/login`.
4. The backend signs in through Supabase Auth and rejects all users except `testw065@gmail.com`.
5. On success, the backend sets secure authentication cookies and returns the authorized user profile.
6. The React app renders the dashboard and begins normal dashboard requests.
7. `POST /api/auth/logout` signs out the Supabase session, clears cookies, and returns the app to the login screen.

## Server Components

### Supabase Auth Client

Extend the existing server-only Supabase module with separate authentication helpers. The service-role key remains server-only and is never serialized into frontend code or API responses.

### Cookie Session

Use two HTTP-only cookies:

- `dl_access_token`: Supabase access token.
- `dl_refresh_token`: Supabase refresh token.

Cookie policy:

- `HttpOnly`
- `SameSite=Lax`
- `Secure` in production/Vercel
- `Path=/`
- Access-token lifetime aligned with the Supabase session
- Refresh token cleared on logout or failed refresh

### API Endpoints

Public endpoints:

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`

Protected endpoints:

- `GET /api/dashboard`
- `GET /api/status`
- `POST /api/refresh`
- `GET /api/source`
- `POST /api/source`
- `POST /api/upload-dashboard`

An authentication middleware validates the access token with Supabase and verifies the normalized email equals `testw065@gmail.com`. Missing, expired, invalid, or unauthorized sessions return HTTP `401` without running the protected route.

### Session Refresh

When the access token is expired but a refresh token exists, the session endpoint refreshes through Supabase, replaces both cookies, and returns the same authorized profile. Failed refresh clears both cookies and returns `401`.

## Frontend Components

### Authentication Boundary

Add a top-level authentication boundary with three states:

- Checking session
- Logged out
- Authenticated

Dashboard data hooks mount only in the authenticated state, preventing unauthorized background API requests.

### Login Screen

The login screen uses the existing white, blue, and neutral dashboard visual language. It contains:

- Data Lense MLH identity
- Email field
- Password field
- Show/hide password control
- Sign-in button
- Inline loading and error states

The email field may be prefilled with `testw065@gmail.com`; the password is never embedded in source code or persisted by the app.

### Authenticated Header

Replace the static `Demo User` label with the authenticated email and add a clear logout command. Logging out immediately clears dashboard state and shows the login screen.

## Account Provisioning

Create or update the Supabase Auth user:

- Email: `testw065@gmail.com`
- Password: supplied by the user during this request
- Email confirmed: yes

Provisioning is performed through the server-side Supabase Admin API. The password is not written to repository files, logs, tests, screenshots, or documentation.

## Error Handling

- Invalid credentials: show `Email or password is incorrect.`
- Unauthorized email: sign out immediately and show `This account is not authorized for this dashboard.`
- Missing Supabase configuration: return a server configuration error without exposing key values.
- Expired session: attempt one refresh, then return to login if refresh fails.
- Network error: preserve the login form and show a retryable message.

## Security Requirements

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to Vite or browser code.
- Never store the supplied password in source, local storage, cookies, or documentation.
- Use generic credential errors to avoid account enumeration.
- Normalize email comparisons to lowercase.
- Protect APIs at the server boundary rather than relying on hidden frontend routes.
- Clear authentication cookies on every rejected unauthorized-email attempt.

## Testing

Automated tests cover:

- Cookie parsing and serialization.
- Authorized-email normalization and rejection.
- Protected middleware behavior for missing and valid sessions.
- Login response behavior without embedding credentials.
- Session-expiry and cookie-clearing behavior.

Browser verification covers:

- Logged-out users see only the login screen.
- Incorrect credentials show an inline error.
- The approved credentials open the dashboard.
- Protected APIs reject unauthenticated requests.
- Refresh preserves an authenticated session.
- Logout returns to login.
- Desktop and mobile login layouts do not overflow.

## Assumptions

- Existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values refer to the intended Supabase project.
- Supabase email/password authentication is enabled.
- Only `testw065@gmail.com` is authorized until the allowlist is explicitly changed.

## Out Of Scope

- Self-registration.
- Password reset.
- Social login.
- Multi-role permissions.
- Multi-user administration.

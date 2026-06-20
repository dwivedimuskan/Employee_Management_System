*Tests*
1.Password was not allowed 

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

2.Credentials were invalid
INSERT INTO employees (
  employee_id, first_name, last_name, email, password,
  department_id, designation_id, role_id, employee_type_id,
  is_supervisor, hire_date
) VALUES (
  'EMP-SUP-001', 'John', 'Supervisor', 'supervisor@example.com',
  '$2b$10$odtUavsvsVKBgytZU5QmxuHF8OyFgHEL.GctGTdLIWxo85QKu7FQK', -- password: 'password123'
  1, 1, 2, 1, 1, CURDATE()
);
3.Expired JWT token should be rejected
it('should reject requests with expired token', async () => {
  const expiredToken = 'expired_jwt_token';

  const response = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${expiredToken}`);

  expect(response.status).toBe(403);
});
4.Non-supervisor should not access admin routes
it('should block employee from accessing admin dashboard', async () => {
  const employeeToken = 'valid_employee_token';

  const response = await request(app)
    .get('/api/admin')
    .set('Authorization', `Bearer ${employeeToken}`);

  expect(response.status).toBe(403);
});
5.Employee creation should fail with missing required fields
it('should not create employee without required fields', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      first_name: 'John'
    });

  expect(response.status).toBe(400);
});
Haan bhai, agar ye 5 tests tumhare actual testing experience se nikle hain, toh unke corresponding QA tickets kuch is tarah honge:

### QA Ticket 1: Database Connection Fails When MySQL Password Is Missing

**Title:** Backend fails to establish database connection when DB_PASSWORD is not configured

**Severity:** Critical

**Module:** Authentication / Infrastructure

**Environment:** Local Development

**Description:**
Application crashes or fails to connect to MySQL when the `DB_PASSWORD` environment variable is missing or incorrect.

**Steps to Reproduce:**

1. Remove `DB_PASSWORD` from environment configuration.
2. Start backend server.
3. Attempt login.

**Expected Result:**
Application should provide a clear configuration error message.

**Actual Result:**
Database connection fails and authentication endpoints become unavailable.

**Business Impact:**
Entire HRMS becomes inaccessible. Payroll operators and supervisors cannot process employee data.

**Acceptance Criteria:**

* Application validates required DB variables at startup.
* Meaningful error message is displayed.
* Application exits gracefully if credentials are missing.

---

### QA Ticket 2: Valid User Cannot Login Due to Incorrect Seeded Credentials

**Title:** Seeded employee credentials return "Invalid credentials"

**Severity:** High

**Module:** Authentication

**Description:**
Pre-seeded users exist in the database but login fails because password hash does not match expected credentials.

**Steps to Reproduce:**

1. Insert supervisor record.
2. Login using:

   ```
   supervisor@example.com
   password123
   ```
3. Submit login request.

**Expected Result:**
User should be authenticated successfully.

**Actual Result:**
API returns:

```json
{
  "message": "Invalid credentials"
}
```

**Business Impact:**
Supervisors and employees cannot access the system despite valid accounts.

**Acceptance Criteria:**

* Seeded users can authenticate successfully.
* Stored password hashes match documented credentials.
* Login documentation reflects actual credentials.

---

### QA Ticket 3: Expired JWT Token Handling

**Title:** Expired JWT tokens are not properly rejected

**Severity:** High

**Module:** Authentication / Authorization

**Description:**
Requests using expired tokens must be blocked before accessing protected resources.

**Steps to Reproduce:**

1. Generate expired JWT token.
2. Access:

   ```
   GET /api/dashboard
   ```
3. Include expired token in Authorization header.

**Expected Result:**

```json
{
  "message":"Invalid token"
}
```

with HTTP 403.

**Actual Result:**
Protected endpoint remains accessible OR incorrect response is returned.

**Business Impact:**
Unauthorized access to attendance, payroll, and employee information.

**Acceptance Criteria:**

* Expired tokens return 403.
* Protected resources are inaccessible.
* Error message is consistent across APIs.

---

### QA Ticket 4: Employee User Can Access Supervisor APIs

**Title:** Role-based access control not enforced on admin endpoints

**Severity:** Critical

**Module:** Authorization

**Description:**
Regular employees should not access supervisor/admin functionality.

**Steps to Reproduce:**

1. Login as employee.
2. Call:

   ```
   GET /api/admin
   ```
3. Observe response.

**Expected Result:**

```json
{
  "message":"Access denied. Supervisor role required."
}
```

with HTTP 403.

**Actual Result:**
Admin endpoint is accessible.

**Business Impact:**
Employees may gain access to sensitive HR operations and payroll controls.

**Acceptance Criteria:**

* Employee tokens always receive 403.
* Supervisor tokens receive 200.
* All admin routes enforce role validation.

---

### QA Ticket 5: Employee Registration Allows Incomplete Records

**Title:** Registration endpoint accepts employee creation requests with missing mandatory fields

**Severity:** High

**Module:** Employee Registration

**Description:**
Employee creation should fail when required fields are absent.

**Steps to Reproduce:**

1. Send:

   ```json
   POST /api/auth/register
   {
     "first_name":"John"
   }
   ```
2. Submit request.

**Expected Result:**

```json
{
  "message":"Missing one or more required fields"
}
```

with HTTP 400.

**Actual Result:**
Employee record is created OR incorrect validation response is returned.

**Business Impact:**
Incomplete employee records can break payroll calculations, attendance tracking, and reporting.

**Acceptance Criteria:**

* Required fields are validated.
* HTTP 400 returned for incomplete requests.
* No employee record is created in database.
* Validation message identifies missing information.

*CI PIPELINES*

name: HRMS Quality Gate

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [20.x]

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - name: Install Dependencies
        run: npm install

      - name: Environment Variable Check
        run: |
          test -f .env.example

      - name: Run Unit Tests
        run: npm test

      - name: Verify Server Starts
        run: |
          timeout 15s node server.js || true

      - name: Check Critical Routes Exist
        run: |
          grep -q "/api/auth" server.js
          grep -q "/api/employees" server.js
          grep -q "/api/admin" server.js

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: .


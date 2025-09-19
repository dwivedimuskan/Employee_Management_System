# Employee Management System (EMS)


A comprehensive MERN (MySQL, Express, React, Node.js) stack application for managing employees, attendance, leaves, projects, and more. The system features distinct dashboards for Supervisors and Employees, each tailored with role-specific functionalities.

## ✨ Features

The application provides a robust set of features for two main user roles:

| Supervisor Dashboard                                    | Employee Dashboard                                 |
| ------------------------------------------------------- | -------------------------------------------------- |
| 👑 **Employee Management**: Add, view, edit, & deactivate | 👤 **Profile Management**: View & update details, photo |
| 📊 **Attendance Overview**: Track team presence daily   | 📅 **Attendance History**: View personal records     |
| ✈️ **Leave Approval**: Approve or reject requests        | ✍️ **Leave Application**: Apply & track leave status  |
| 📂 **Project Management**: Assign employees to projects | 🚀 **Project Tracking**: View assigned projects      |
| 📈 **Reporting & Analytics**: View department stats     | 📄 **Document Management**: Upload personal documents  |
| ⚙️ **Admin Functions**: Manage roles, departments, etc. | 💼 **Career & Performance**: View skills, promotions |

---

## 🛠️ Technology Stack

This project is built with a modern and scalable technology stack.

| Category      | Technologies                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| **Frontend**  | `React.js`, `React Router`, `Tailwind CSS`, `Axios`, `Chart.js`, `date-fns`, `React Icons`                 |
| **Backend**   | `Node.js`, `Express.js`, `MySQL2`, `JWT` (for authentication), `Bcrypt` (for hashing), `Multer` (for uploads) |
| **Database**  | `MySQL` (with triggers, stored procedures, and a fully normalized BCNF schema)                               |

---

## 📁 Project Structure

The repository is organized into three main directories for clear separation of concerns.

```
employee-management-system/
├── backend/        # Node.js + Express backend server
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   └── server.js
├── database/       # MySQL database scripts
│   └── schema.sql
└── frontend/       # React frontend application
    ├── public/
    └── src/
        ├── assets/
        ├── components/
        ├── contexts/
        ├── pages/
        ├── services/
        └── App.js
```

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [MySQL Server](https://dev.mysql.com/downloads/mysql/)
- `npm` or `yarn` package manager

### 1. Database Setup

1.  Create a new MySQL database.
    ```sql
    CREATE DATABASE employee_management_system;
    ```
2.  Import the schema by running the script located at `database/schema.sql`.

### 2. Backend Setup

1.  Navigate to the backend directory:
    ```sh
    cd backend
    ```
2.  Install the required dependencies:
    ```sh
    npm install
    ```
3.  Create a `.env` file in the `backend` directory and add the following environment variables:
    ```
    PORT=5000
    DB_HOST=localhost
    DB_USER=your_mysql_username
    DB_PASSWORD=your_mysql_password
    DB_NAME=employee_management_system
    JWT_SECRET=your_super_secret_jwt_key
    ```
4.  Start the backend server:
    ```sh
    npm start
    ```
    The server should now be running on `http://localhost:5000`.

### 3. Frontend Setup

1.  Open a new terminal and navigate to the frontend directory:
    ```sh
    cd frontend
    ```
2.  Install the required dependencies:
    ```sh
    npm install
    ```
3.  Create a `.env` file in the `frontend` directory and add the following:
    ```
    REACT_APP_API_URL=http://localhost:5000/api
    ```
4.  Start the React application:
    ```sh
    npm start
    ```
    The application will be available at `http://localhost:3000`.

---

## 🔑 How to Login

To explore the system, you can use the pre-defined test users. First, ensure these users exist in your database by running the SQL script below.

### Add Test Users (SQL)

```sql
-- Add a supervisor
INSERT INTO employees (
  employee_id, first_name, last_name, email, password,
  department_id, designation_id, role_id, employee_type_id,
  is_supervisor, hire_date
) VALUES (
  'EMP-SUP-001', 'John', 'Supervisor', 'supervisor@example.com',
  '$2b$10$odtUavsvsVKBgytZU5QmxuHF8OyFgHEL.GctGTdLIWxo85QKu7FQK', -- password: 'password123'
  1, 1, 2, 1, 1, CURDATE()
);

-- Add a regular employee
INSERT INTO employees (
  employee_id, first_name, last_name, email, password,
  department_id, designation_id, role_id, employee_type_id,
  is_supervisor, hire_date, reports_to
) VALUES (
  'EMP-REG-002', 'Jane', 'Employee', 'employee@example.com',
  '$2b$10$odtUavsvsVKBgytZU5QmxuHF8OyFgHEL.GctGTdLIWxo85QKu7FQK', -- password: 'password123'
  1, 1, 4, 1, 0, CURDATE(), 1
);
```

### Login Credentials

Navigate to `http://localhost:3000/login` and use the following credentials:

**🧑‍💼 Supervisor Login:**
- **Email**: `supervisor@example.com`
- **Password**: `password123`

**👨‍💻 Employee Login:**
- **Email**: `employee@example.com`
- **Password**: `password123`

---

## 🗄️ Database Schema

The database is designed following BCNF normalization principles to ensure data integrity and reduce redundancy.

<details>
<summary>Click to view the full database schema</summary>

```sql
-- database/schema.sql

CREATE DATABASE IF NOT EXISTS employee_management_system;
USE employee_management_system;

-- Departments table
CREATE TABLE departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Designations table
CREATE TABLE designations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Roles table
CREATE TABLE roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- And so on for all other tables...
-- (The full schema provided in the context would be placed here)
```

</details>

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

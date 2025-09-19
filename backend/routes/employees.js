// backend/routes/employees.js
module.exports = (pool, upload) => {
    const express = require('express');
    const router = express.Router();
    const bcrypt = require('bcrypt');
    

  const resolveMeToUserId = (req) => {
   
    if (!req.user || !req.user.id) {
        console.error("resolveMeToUserId called without authenticated user on request.");
        return false;
    }
    if (req.params.id && req.params.id.toLowerCase() === 'me') {
        req.params.id = req.user.id.toString(); 
    }
    return true;
  };


    // Get all employees (for supervisors)
    router.get('/', async (req, res) => {
      try {
          if (!req.user) {
               return res.status(401).json({ message: 'Authentication required' });
          }
          const page = parseInt(req.query.page) || 1;
          const isFetchingSupervisorsForDropdown = req.query.is_supervisor === 'true' || req.query.is_supervisor === '1';
          const limit = parseInt(req.query.limit) || (isFetchingSupervisorsForDropdown ? 10000 : 10);
          const offset = (page - 1) * limit;
          const department = req.query.department;
          const search = req.query.search;
          const isActiveFilter = req.query.is_active;
          const isSupervisorFilter = req.query.is_supervisor;

          let baseQuery = `
              FROM employees e
              LEFT JOIN departments d ON e.department_id = d.id
              LEFT JOIN designations des ON e.designation_id = des.id
              WHERE 1=1
          `;
          const queryParams = [];

          // Department Filter
          if (department) {
              baseQuery += " AND e.department_id = ?";
              queryParams.push(department);
          }
          // Search Filter
          if (search) {
              baseQuery += " AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.employee_id LIKE ?)";
              const searchParam = `%${search}%`;
              queryParams.push(searchParam, searchParam, searchParam, searchParam);
          }

          if (isActiveFilter !== undefined) {
              
              baseQuery += " AND e.is_active = ?";
              queryParams.push(isActiveFilter === 'true' || isActiveFilter === '1' ? 1 : 0);
          } else if (isFetchingSupervisorsForDropdown) {
  
               baseQuery += " AND e.is_active = 1";
          }
          // Apply is_supervisor filter if requested
          if (isSupervisorFilter !== undefined) {
              baseQuery += " AND e.is_supervisor = ?";
              queryParams.push(isSupervisorFilter === 'true' || isSupervisorFilter === '1' ? 1 : 0);
          }

          // Count Query
          const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
          const [countResult] = await pool.query(countQuery, queryParams);
          const total = countResult[0]?.total || 0;

          // Data Query
          const dataQuery = `
              SELECT e.id, e.employee_id, e.first_name, e.last_name, e.email, e.phone,
                     e.hire_date, e.is_active, e.profile_image, e.is_supervisor,
                     d.name as department_name, des.name as designation_name
              ${baseQuery}
              ORDER BY e.first_name, e.last_name
              LIMIT ? OFFSET ?
          `;
          const dataQueryParams = [...queryParams, limit, offset];
          const [employees] = await pool.query(dataQuery, dataQueryParams);

          const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

          res.json({
              employees: employees || [],
              pagination: { page, limit, total, totalPages }
          });
      } catch (error) {
          console.error('Error fetching employees:', error);
          res.status(500).json({ message: 'Server error', error: error.message });
      }
  });
  
  // Get employee by ID
  router.get('/:id', async (req, res) => {
    try {
        
        let idParam = req.params.id; 

        if (idParam === 'me') {
            // Check if user is authenticated 
            if (req.user && req.user.id !== undefined) {
                idParam = req.user.id.toString(); 
                console.log(`(GET /employees) Resolved 'me' to User ID: ${idParam}`);
            } else {
               
                return res.status(401).json({ message: 'Authentication required to access own profile.' });
            }
        }
   


        const employeeIdToFetch = parseInt(idParam); // Parse the final ID (number or NaN)

        if (isNaN(employeeIdToFetch)) {
            return res.status(400).json({ message: 'Invalid Employee ID.' });
        }
   

        // Ensure req.user is present
        if (!req.user || req.user.id === undefined) {
            return res.status(401).json({ message: 'Authentication data missing.' });
        }

        // Allow if user is supervisor OR if their numeric ID matches the requested numeric ID
        if (!req.user.is_supervisor && Number(req.user.id) !== employeeIdToFetch) {
             console.log(`AUTH FAIL: User ${req.user.id} != Target ${employeeIdToFetch}, Supervisor: ${req.user.is_supervisor}`);
            return res.status(403).json({ message: 'Not authorized' });
        }
         console.log(`AUTH PASS: User ${req.user.id}, Target ${employeeIdToFetch}, Supervisor: ${req.user.is_supervisor}`);
          


        const [rows] = await pool.query(` SELECT e.*, d.name as department_name, des.name as designation_name, r.name as role_name, et.name as employee_type_name, CONCAT(supervisor.first_name, ' ', supervisor.last_name) as supervisor_name, (SELECT amount FROM salary_history sh WHERE sh.employee_id = e.id ORDER BY sh.effective_date DESC, sh.created_at DESC LIMIT 1) as current_salary FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN designations des ON e.designation_id = des.id LEFT JOIN roles r ON e.role_id = r.id LEFT JOIN employee_types et ON e.employee_type_id = et.id LEFT JOIN employees supervisor ON e.reports_to = supervisor.id WHERE e.id = ? `, [employeeIdToFetch]); // Use employeeIdToFetch here

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        const employee = rows[0];

        // Get skills using the correct ID
        const [skills] = await pool.query(`
            SELECT es.id as employee_skill_id, s.id as skill_id, s.name as skill_name, es.proficiency_level, es.verified
            FROM employee_skills es
            JOIN skills s ON es.skill_id = s.id
            WHERE es.employee_id = ?
        `, [employeeIdToFetch]);

        // Get projects 
        const [projects] = await pool.query(`
            SELECT pa.id, p.name as project_name, pa.role, pa.start_date, pa.end_date, p.status as project_status
            FROM project_assignments pa
            JOIN projects p ON pa.project_id = p.id
            WHERE pa.employee_id = ?
        `, [employeeIdToFetch]);

        // Get documents 
        const [documents] = await pool.query(`
            SELECT id, document_type, title, uploaded_at
            FROM employee_documents
            WHERE employee_id = ?
        `, [employeeIdToFetch]);

        // For supervisors
        let specificSupervisorData = {};
        if (req.user.is_supervisor) {
            // Get performance reviews using correct ID
            const [reviews] = await pool.query(`
                SELECT id, review_period_start, review_period_end, rating, status
                FROM performance_reviews
                WHERE employee_id = ?
                ORDER BY review_period_end DESC
            `, [employeeIdToFetch]); 

            // Get attendance summary 
            const [attendanceSummaryRows] = await pool.query(`
                SELECT
                  COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
                  COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
                  COUNT(CASE WHEN status = 'late' THEN 1 END) as late_count,
                  COUNT(CASE WHEN status = 'on-leave' THEN 1 END) as leave_count
                FROM attendance
                WHERE employee_id = ? AND YEAR(date) = YEAR(CURRENT_DATE)
            `, [employeeIdToFetch]); 

            specificSupervisorData = {
                performance_reviews: reviews || [], 
                attendance_summary: attendanceSummaryRows?.[0] || { present_count: 0, absent_count: 0, late_count: 0, leave_count: 0 }
            };
        }


        res.json({
            employee: employee, 
            skills: skills || [], 
            projects: projects || [], 
            documents: documents || [], 
            
            ...(req.user.is_supervisor ? specificSupervisorData : {}) // Spread only if supervisor
        });
      

    } catch (error) {
        console.error("Error in GET /employees/:id :", error); 
        res.status(500).json({ message: 'Server error getting employee details', error: error.message });
    }
});

router.get('/:id/salary-history', async (req, res) => {
  try {
      let idParam = req.params.id;
      if (idParam === 'me') {
          if (!req.user?.id) return res.status(401).json({ message: 'Authentication required.' });
          idParam = req.user.id.toString();
      }
      const employeeIdToFetch = parseInt(idParam);
      if (isNaN(employeeIdToFetch)) return res.status(400).json({ message: 'Invalid Employee ID.' });

      // Authorization: Allow Supervisor OR Self
      if (!req.user || (!req.user.is_supervisor && Number(req.user.id) !== employeeIdToFetch)) {
          return res.status(403).json({ message: 'Not authorized to view this salary history.' });
      }

      const [history] = await pool.query(`
          SELECT sh.*, creator.first_name as created_by_first_name, creator.last_name as created_by_last_name
          FROM salary_history sh LEFT JOIN employees creator ON sh.created_by = creator.id
          WHERE sh.employee_id = ? ORDER BY sh.effective_date DESC, sh.created_at DESC
      `, [employeeIdToFetch]);
      res.json(history || []);

  } catch (error) {
      console.error(`Error fetching salary history for ${req.params.id}:`, error);
      res.status(500).json({ message: 'Server error fetching salary history', error: error.message });
  }
});

// Add subsequent salary record
router.post('/:id/salary-history', async (req, res) => {
  console.log('--- POST /salary-history ---');
    console.log('Requester (req.user):', JSON.stringify(req.user, null, 2)); // Log the user object from JWT
    console.log('Target Employee ID (req.params.id):', req.params.id);
  try {
       const employeeIdTarget = parseInt(req.params.id);
       const changingUserId = req.user.id;
       const changingUserRoleId = req.user.role_id; // Assumes in JWT

       const SENIOR_SUPERVISOR_ROLE_ID = 2; // Manager
       const SUPERVISOR_ROLE_ID = 3;        // Supervisor
       const REGULAR_EMPLOYEE_ROLE_ID = 4;  // Regular Employee

      
       if (!req.user || !(changingUserRoleId === SENIOR_SUPERVISOR_ROLE_ID || changingUserRoleId === SUPERVISOR_ROLE_ID)) return res.status(403).json({ message: 'Unauthorized.' });
       if (isNaN(employeeIdTarget)) return res.status(400).json({ message: 'Invalid target ID.' });
       if (Number(changingUserId) === employeeIdTarget) return res.status(403).json({ message: 'Cannot modify own salary.' });

       const [targetEmployeeRows] = await pool.query('SELECT role_id, department_id FROM employees WHERE id = ? AND is_active = 1', [employeeIdTarget]);
       if (targetEmployeeRows.length === 0) return res.status(404).json({ message: 'Target employee not found/inactive.' });
       const target = targetEmployeeRows[0];

       const supervisorDepartmentId = req.user.department_id; // Assumes in JWT
       if (!supervisorDepartmentId) return res.status(500).json({ message: "Could not verify supervisor's department." });

       // Permission Logic
       let isAuthorized = false;
       if (supervisorDepartmentId === target.department_id) {
          if (changingUserRoleId === SENIOR_SUPERVISOR_ROLE_ID && (target.role_id === SUPERVISOR_ROLE_ID || target.role_id === REGULAR_EMPLOYEE_ROLE_ID)) isAuthorized = true;
          else if (changingUserRoleId === SUPERVISOR_ROLE_ID && target.role_id === REGULAR_EMPLOYEE_ROLE_ID) isAuthorized = true;
       }
       if (!isAuthorized) return res.status(403).json({ message: 'Not authorized for this employee/role/department.' });
       

       const { amount, effective_date, reason } = req.body;
      
        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0 || !effective_date) return res.status(400).json({ message: 'Valid Amount and Effective Date required.' });
       const parsedAmount = parseFloat(amount);

       // Insert
        const [result] = await pool.query(`INSERT INTO salary_history (employee_id, amount, effective_date, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())`, [employeeIdTarget, parsedAmount, effective_date, reason || null, changingUserId]);

       // Fetch and return new record
        const [newRecord] = await pool.query(`SELECT sh.*, c.first_name as created_by_first_name, c.last_name as created_by_last_name FROM salary_history sh LEFT JOIN employees c ON sh.created_by = c.id WHERE sh.id = ?`, [result.insertId]);
        res.status(201).json({ message: "Salary record added.", newRecord: newRecord[0] || null });

  } catch (error) { console.log('/:id/salary-history');}
});
  
   //Add a skill to an employee 
   router.post('/:employeeId/skills', async (req, res) => {
    if (!req.user || !req.user.is_supervisor) {
        return res.status(403).json({ message: 'Not authorized' });
    }

    const { employeeId } = req.params;
    // Receive skill_name instead of skill_id
    const { skill_name, proficiency_level } = req.body;
    const verifierId = req.user.id;

    if (!skill_name || !skill_name.trim() || !proficiency_level) {
        return res.status(400).json({ message: 'Skill Name and Proficiency Level are required.' });
    }
    const trimmedSkillName = skill_name.trim(); 
    if (!['beginner', 'intermediate', 'advanced', 'expert'].includes(proficiency_level)) {
         return res.status(400).json({ message: 'Invalid proficiency level.' });
    }

    let connection; 
    try {
        // Start a transaction
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Find or Create the Skill
        let skillId;

        const [existingSkills] = await connection.query('SELECT id FROM skills WHERE name = ?', [trimmedSkillName]);

        if (existingSkills.length > 0) {
            skillId = existingSkills[0].id;
        } else {
            
            const [newSkillResult] = await connection.query(
                'INSERT INTO skills (name, created_at, updated_at) VALUES (?, NOW(), NOW())',
                [trimmedSkillName] 
            );
            skillId = newSkillResult.insertId; 
            
             console.log(`Created new skill: '${trimmedSkillName}' with ID: ${skillId}`);
        }

         // 2. Check if the employee already has this skill link
         const [currentLink] = await connection.query(
             'SELECT id FROM employee_skills WHERE employee_id = ? AND skill_id = ?',
             [employeeId, skillId]
         );

         if (currentLink.length > 0) {
             await connection.rollback(); // Rollback transaction
             return res.status(409).json({ message: 'Employee already possesses this skill.' });
         }

        // 3. Check if employee exists (moved inside transaction)
        const [empCheck] = await connection.query('SELECT id FROM employees WHERE id = ?', [employeeId]);
        if (empCheck.length === 0) {
             await connection.rollback();
             return res.status(404).json({ message: 'Employee not found' });
        }


        // 4. Insert the employee_skill link
        const [result] = await connection.query(
            'INSERT INTO employee_skills (employee_id, skill_id, proficiency_level, verified, verified_by, updated_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [employeeId, skillId, proficiency_level, true, verifierId]
        );

        // 5. Fetch details of the added link to return
        const [newSkillData] = await connection.query(`
             SELECT es.id as employee_skill_id, s.id as skill_id, s.name as skill_name, es.proficiency_level, es.verified
             FROM employee_skills es
             JOIN skills s ON es.skill_id = s.id
             WHERE es.id = ?
        `, [result.insertId]);

         // 6. Commit Transaction
         await connection.commit();

        res.status(201).json({
            message: `Skill '${trimmedSkillName}' added successfully`,
            addedSkill: newSkillData[0]
        });

    } catch (error) {
        
         if (connection) await connection.rollback();
        console.error('Error adding employee skill:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
             return res.status(409).json({ message: 'Employee already possesses this skill (concurrent issue?).' });
         }
        res.status(500).json({ message: 'Server error adding skill', error: error.message });
    } finally {
      
         if (connection) connection.release();
     }
});

// Remove a skill from an employee 
router.delete('/:employeeId/skills/:employeeSkillId', async (req, res) => {
   
    if (!req.user || !req.user.is_supervisor) {
        return res.status(403).json({ message: 'Not authorized to remove skills' });
    }

    const { employeeId, employeeSkillId } = req.params;

    try {
   
         const [linkCheck] = await pool.query(
             'SELECT id FROM employee_skills WHERE id = ? AND employee_id = ?',
             [employeeSkillId, employeeId]
         );

         if (linkCheck.length === 0) {
             return res.status(404).json({ message: 'Employee skill link not found.' });
         }

        // Delete the employee_skill record
        const [result] = await pool.query(
            'DELETE FROM employee_skills WHERE id = ? AND employee_id = ?',
            [employeeSkillId, employeeId]
        );

        if (result.affectedRows === 0) {
          
            return res.status(404).json({ message: 'Employee skill not found or already deleted.' });
        }

        res.status(200).json({ message: 'Skill removed successfully' }); 

    } catch (error) {
        console.error('Error removing employee skill:', error);
        res.status(500).json({ message: 'Server error removing skill', error: error.message });
    }
});



  // Update employee (partial update)
router.patch('/:id', upload.single('profileImage'), async (req, res) => {
  try {
    
      let idParam = req.params.id; 

      if (idParam === 'me') {
          if (req.user && req.user.id !== undefined) {
               idParam = req.user.id.toString(); 
          
          } else {
              
              return res.status(401).json({ message: 'Authentication required to update profile using "me".' });
          }
      }
     
      const employeeIdToUpdate = parseInt(idParam); 

       if (isNaN(employeeIdToUpdate)) {
           return res.status(400).json({ message: 'Invalid Employee ID provided in URL.' });
       }

       // Ensure req.user exists 
       if (!req.user || req.user.id === undefined) {
           return res.status(401).json({ message: 'Authentication information missing.' });
       }


      if (!req.user.is_supervisor && Number(req.user.id) !== employeeIdToUpdate) {
           console.log(`Authorization failed: Non-supervisor ${req.user.id} trying to edit ${employeeIdToUpdate}.`);
          return res.status(403).json({ message: 'Not authorized' });
      }
    


      // Fields that regular employees can update
      const allowedFields = [ 'phone', 'address', 'emergency_contact' ];
      
      const supervisorFields = [ 'first_name', 'last_name', 'department_id', 'designation_id', 'role_id', 'employee_type_id', 'is_supervisor', 'birth_date', 'gender', 'reports_to' ]; // Assuming is_active handled elsewhere

      const updateData = {};
      const bodyKeys = Object.keys(req.body);

      bodyKeys.forEach(key => {
          if (allowedFields.includes(key)) {
              
               updateData[key] = req.body[key];
          } else if (supervisorFields.includes(key)) {
              
               if (req.user.is_supervisor) {
                   updateData[key] = req.body[key];
               } else {
                    console.warn(`AUTH Warning: Non-supervisor ${req.user.id} attempted to update restricted field '${key}' for employee ${employeeIdToUpdate}. Ignoring field.`);
                }
          }
           
      });
    


      // Handle profile image upload
      if (req.file) {
          updateData.profile_image = `/uploads/${req.file.filename}`;
           
      }

       // Check if any valid data was actually provided/allowed
      if (Object.keys(updateData).length === 0) {
       
          if (!req.file) {
               return res.status(400).json({ message: 'No valid fields provided for update.' });
          } else if (Object.keys(req.body).length === 0) {
    
               if (!updateData.profile_image) {

                   return res.status(400).json({ message: 'Image upload specified but no image data found.' });
               }
           } else {
               
                return res.status(400).json({ message: 'No permitted fields provided for update.' });
            }
      }


      
      const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
     
      const queryParams = [...Object.values(updateData), employeeIdToUpdate];
      
      const query = `UPDATE employees SET ${setClause}, updated_at = NOW() WHERE id = ?`;

      // Execute update
      const [result] = await pool.query(query, queryParams);

      if (result.affectedRows === 0) {
       
           const [existsCheck] = await pool.query('SELECT id FROM employees WHERE id = ?', [employeeIdToUpdate]);
           if (existsCheck.length === 0) {
                return res.status(404).json({ message: 'Employee not found.' });
           } else {
                
                 return res.json({ message: 'Profile updated successfully (No data changes detected).', updated: {} });
           }
      }

      // Log the update using the correct ID
       try {
           await pool.query(
               'INSERT INTO system_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
               [req.user.id, 'UPDATE', 'employees', employeeIdToUpdate, `Updated fields: ${Object.keys(updateData).join(', ')}`]
           );
        } catch(logError) { console.error("System Log Error:", logError); }


      // Fetch only the actually updated fields to confirm
      const updatedFieldsResultKeys = Object.keys(updateData);
      let updatedResultData = {};
       if (updatedFieldsResultKeys.length > 0) {
         try {
             const selectUpdatedQuery = `SELECT ${updatedFieldsResultKeys.join(', ')} FROM employees WHERE id = ?`;
             const [updatedRows] = await pool.query(selectUpdatedQuery, [employeeIdToUpdate]);
             updatedResultData = updatedRows[0] || {};
          } catch (fetchError) { console.error("Error fetching updated data:", fetchError); }
       }

      res.json({
          message: 'Employee profile updated successfully',
           updated: updatedResultData 
      });

  } catch (error) {
      console.error("Error during employee update:", error); 
      res.status(500).json({ message: 'Server error updating profile', error: error.message });
  }
});
  
  // Deactivate/Reactivate employee (supervisor only)
  router.patch('/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { is_active } = req.body;
      
      if (!req.user.is_supervisor) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      
      if (is_active === undefined) {
        return res.status(400).json({ message: 'is_active field is required' });
      }
      
      // Execute update
      const [result] = await pool.query(
        'UPDATE employees SET is_active = ? WHERE id = ?',
        [is_active ? 1 : 0, id]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Employee not found' });
      }
      
      // Log the status change
      await pool.query(
        'INSERT INTO system_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, 'UPDATE', 'employees', id, `Employee ${is_active ? 'activated' : 'deactivated'}`]
      );
      
      res.json({ 
        message: `Employee ${is_active ? 'activated' : 'deactivated'} successfully` 
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
  // Add employee skills
  router.post('/:id/skills', async (req, res) => {
    try {
      const { id } = req.params;
      const { skill_id, proficiency_level } = req.body;
      
      // Check authorization
      if (!req.user.is_supervisor && req.user.id !== parseInt(id)) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      
      // Insert skill
      const [result] = await pool.query(
        'INSERT INTO employee_skills (employee_id, skill_id, proficiency_level) VALUES (?, ?, ?)',
        [id, skill_id, proficiency_level]
      );
      
      res.status(201).json({ 
        message: 'Skill added successfully',
        id: result.insertId 
      });
    } catch (error) {
      console.error(error);
      
      // Handle duplicate skill
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ message: 'Employee already has this skill' });
      }
      
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
  // Get employee's attendance
  router.get('/:id/attendance', async (req, res) => {
    try {
      if (!resolveMeToUserId(req)) {
        return res.status(401).json({ message: 'Authentication required.' });
     }
      const { id } = req.params;
      
      // Check authorization
      if (!req.user.is_supervisor && req.user.id !== parseInt(id)) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      
      // Get period from query params with defaults
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const month = req.query.month ? parseInt(req.query.month) : null;
      
      let query = `
        SELECT date, check_in, check_out, status, note
        FROM attendance
        WHERE employee_id = ? AND YEAR(date) = ?
      `;
      
      const queryParams = [id, year];
      
      if (month !== null) {
        query += ' AND MONTH(date) = ?';
        queryParams.push(month);
      }
      
      query += ' ORDER BY date DESC';
      
      const [attendanceRecords] = await pool.query(query, queryParams);
      
      // Get summary statistics
      const [summary] = await pool.query(`
        SELECT 
          COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
          COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
          COUNT(CASE WHEN status = 'late' THEN 1 END) as late_count,
          COUNT(CASE WHEN status = 'half-day' THEN 1 END) as half_day_count,
          COUNT(CASE WHEN status = 'on-leave' THEN 1 END) as leave_count
        FROM attendance
        WHERE employee_id = ? AND YEAR(date) = ? ${month !== null ? 'AND MONTH(date) = ?' : ''}
      `, queryParams);
      
      res.json({
        records: attendanceRecords,
        summary: summary[0]
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
  // Get employee's leave requests and balances
  router.get('/:id/leaves', async (req, res) => {
    try {
      if (!resolveMeToUserId(req)) {
        return res.status(401).json({ message: 'Authentication required.' });
     }
      const { id } = req.params;
      
      // Check authorization
      if (!req.user.is_supervisor && req.user.id !== parseInt(id)) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      
      // Get leave requests
      const [leaveRequests] = await pool.query(`
        SELECT lr.id, lr.start_date, lr.end_date, lr.total_days, lr.reason,
               lr.status, lr.created_at, lt.name as leave_type,
               CONCAT(e.first_name, ' ', e.last_name) as approved_by_name
        FROM leave_requests lr
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        LEFT JOIN employees e ON lr.approved_by = e.id
        WHERE lr.employee_id = ?
        ORDER BY lr.created_at DESC
      `, [id]);
      
      // Get leave balances
      const [leaveBalances] = await pool.query(`
        SELECT lb.id, lb.year, lb.total_days, lb.used_days,
               (lb.total_days - lb.used_days) as remaining_days,
               lt.name as leave_type, lt.id as leave_type_id
        FROM leave_balances lb
        JOIN leave_types lt ON lb.leave_type_id = lt.id
        WHERE lb.employee_id = ? AND lb.year = YEAR(CURRENT_DATE)
      `, [id]);
      
      res.json({
        requests: leaveRequests,
        balances: leaveBalances
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
  
  return router;
};
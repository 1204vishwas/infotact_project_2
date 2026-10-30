const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// In-memory fallback cache in case MongoDB is temporarily starting up or unavailable
const inMemoryUsers = new Map();

// Helper to seed initial demo users if needed
const initDemoAccounts = async () => {
  const demos = [
    {
      name: 'Dr. Aris Thorne',
      email: 'aris.thorne@gmail.com',
      username: 'aris_infotact',
      password: 'password123',
      role: 'Audio Engineer',
      avatarColor: '#6366f1',
      avatarIcon: 'headphones',
      department: 'Spatial Audio Lab',
      location: [180, 220]
    },
    {
      name: 'Priya Sharma',
      email: 'priya.sharma@gmail.com',
      username: 'priya_dev',
      password: 'password123',
      role: 'Developer',
      avatarColor: '#10b981',
      avatarIcon: 'code',
      department: 'Core WebRTC Team',
      location: [300, 240]
    },
    {
      name: 'Rohan Mehta',
      email: 'rohan.mehta@gmail.com',
      username: 'rohan_lead',
      password: 'password123',
      role: 'Product Manager',
      avatarColor: '#f59e0b',
      avatarIcon: 'briefcase',
      department: 'Product & Design',
      location: [420, 190]
    }
  ];

  for (const demo of demos) {
    try {
      const exists = await User.findOne({ username: demo.username });
      if (!exists) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(demo.password, salt);
        await User.create({
          ...demo,
          password: hashedPassword
        });
      } else if (exists.email !== demo.email) {
        exists.email = demo.email;
        await exists.save();
      }
    } catch (e) {
      // In-memory store fallback
      if (!inMemoryUsers.has(demo.email)) {
        const hashedPassword = await bcrypt.hash(demo.password, 10);
        inMemoryUsers.set(demo.email, {
          _id: 'demo_' + demo.username,
          ...demo,
          password: hashedPassword,
          createdAt: new Date()
        });
      }
    }
  }
};

// Initial trigger for demo accounts
setTimeout(initDemoAccounts, 1500);

// ==========================================
// 1. POST /api/auth/register
// ==========================================
router.post('/register', async (req, res) => {
  try {
    const { name, email, username, password, role, avatarColor, avatarIcon, department } = req.body;

    // Validation
    if (!name || !email || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (Name, Email, Username, Password).'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    // Enforce that only Gmail addresses (@gmail.com) are allowed
    if (!normalizedEmail.endsWith('@gmail.com')) {
      return res.status(400).json({
        success: false,
        message: 'Registration restricted: Only Gmail addresses (@gmail.com) are allowed. Please use your personal or work @gmail.com address.'
      });
    }

    // Check if user already exists in MongoDB
    let existingUser = null;
    let usingMongo = true;
    try {
      existingUser = await User.findOne({
        $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
      });
    } catch (dbErr) {
      usingMongo = false;
      // Fallback search in memory
      for (const u of inMemoryUsers.values()) {
        if (u.email === normalizedEmail || u.username === normalizedUsername) {
          existingUser = u;
          break;
        }
      }
    }

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists. Please login instead.'
        });
      }
      return res.status(409).json({
        success: false,
        message: 'This username is already taken. Please choose another username.'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Initial random coordinates inside office canvas (e.g. 100 to 500)
    const initialCoordinates = [
      Math.floor(Math.random() * 400) + 100,
      Math.floor(Math.random() * 300) + 100
    ];

    let newUser;
    if (usingMongo) {
      newUser = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        username: normalizedUsername,
        password: hashedPassword,
        role: role || 'Team Member',
        avatarColor: avatarColor || '#3b82f6',
        avatarIcon: avatarIcon || 'user',
        department: department || 'Engineering',
        location: initialCoordinates
      });
    } else {
      newUser = {
        _id: 'user_' + Date.now(),
        name: name.trim(),
        email: normalizedEmail,
        username: normalizedUsername,
        password: hashedPassword,
        role: role || 'Team Member',
        avatarColor: avatarColor || '#3b82f6',
        avatarIcon: avatarIcon || 'user',
        department: department || 'Engineering',
        location: initialCoordinates,
        createdAt: new Date()
      };
      inMemoryUsers.set(normalizedEmail, newUser);
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        id: newUser._id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to ProxiSpeak Virtual Office.',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        avatarColor: newUser.avatarColor,
        avatarIcon: newUser.avatarIcon,
        department: newUser.department,
        location: newUser.location,
        status: newUser.status || 'online'
      }
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error occurred while creating your account.'
    });
  }
});

// ==========================================
// 2. POST /api/auth/login
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or username

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your email/username and password.'
      });
    }

    const cleanIdentifier = identifier.toLowerCase().trim();

    // Enforce that email identifiers must be a Gmail account (@gmail.com)
    if (cleanIdentifier.includes('@') && !cleanIdentifier.endsWith('@gmail.com')) {
      return res.status(400).json({
        success: false,
        message: 'Access restricted: Only Gmail accounts (@gmail.com) are permitted. Please log in with your @gmail.com address.'
      });
    }

    // Find user by email or username
    let user = null;
    try {
      user = await User.findOne({
        $or: [{ email: cleanIdentifier }, { username: cleanIdentifier }]
      });
    } catch (dbErr) {
      for (const u of inMemoryUsers.values()) {
        if (u.email === cleanIdentifier || u.username === cleanIdentifier) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. No user found with this email or username.'
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password. Please verify your password and try again.'
      });
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Authentication successful. Entering ProxiSpeak office space...',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        avatarColor: user.avatarColor || '#3b82f6',
        avatarIcon: user.avatarIcon || 'user',
        department: user.department || 'General',
        location: user.location,
        status: 'online'
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error occurred during login. Please try again.'
    });
  }
});

// ==========================================
// 3. POST /api/auth/social-login (Google & Facebook)
// ==========================================
router.post('/social-login', async (req, res) => {
  try {
    const { provider, name, email, avatarColor, providerId } = req.body;

    if (!provider || !name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Provider, name, and email are required for social authentication.'
      });
    }

    const providerLower = provider.toLowerCase();
    if (providerLower !== 'google' && providerLower !== 'facebook') {
      return res.status(400).json({
        success: false,
        message: 'Unsupported social provider. Only Google and Facebook are supported.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Enforce that social accounts must use @gmail.com
    if (!normalizedEmail.endsWith('@gmail.com')) {
      return res.status(400).json({
        success: false,
        message: `Authentication with ${providerUpper(providerLower)} requires a verified Gmail address (@gmail.com).`
      });
    }

    // Check if user already exists with this email
    let user = null;
    let usingMongo = true;
    try {
      user = await User.findOne({ email: normalizedEmail });
    } catch (e) {
      usingMongo = false;
      for (const u of inMemoryUsers.values()) {
        if (u.email === normalizedEmail) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      // Auto-generate clean unique username from email
      const baseUsername = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      let finalUsername = baseUsername;

      let usernameTaken = false;
      try {
        const existingUsername = await User.findOne({ username: finalUsername });
        if (existingUsername) usernameTaken = true;
      } catch (e) {
        for (const u of inMemoryUsers.values()) {
          if (u.username === finalUsername) {
            usernameTaken = true;
            break;
          }
        }
      }

      if (usernameTaken) {
        finalUsername = `${baseUsername}_${Math.floor(Math.random() * 899 + 100)}`;
      }

      const defaultColors = {
        google: '#ea4335',
        facebook: '#1877f2'
      };
      const chosenColor = avatarColor || defaultColors[providerLower] || '#6366f1';

      // Secure dummy password hash for social oauth accounts
      const salt = await bcrypt.genSalt(10);
      const randomPassword = `oauth_${providerLower}_${Math.random().toString(36).substring(2)}${Date.now()}`;
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      const initialCoordinates = [
        Math.floor(Math.random() * 400) + 120,
        Math.floor(Math.random() * 300) + 120
      ];

      const departmentName = providerLower === 'google' ? 'Google Workspace Team' : 'Facebook Workplace Hub';

      if (usingMongo) {
        user = await User.create({
          name: name.trim(),
          email: normalizedEmail,
          username: finalUsername,
          password: hashedPassword,
          role: 'Developer',
          avatarColor: chosenColor,
          avatarIcon: providerLower,
          department: departmentName,
          location: initialCoordinates
        });
      } else {
        user = {
          _id: 'user_' + Date.now(),
          name: name.trim(),
          email: normalizedEmail,
          username: finalUsername,
          password: hashedPassword,
          role: 'Developer',
          avatarColor: chosenColor,
          avatarIcon: providerLower,
          department: departmentName,
          location: initialCoordinates,
          status: 'online',
          createdAt: new Date()
        };
        inMemoryUsers.set(normalizedEmail, user);
      }
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: `Signed in successfully via ${providerUpper(providerLower)} with ${normalizedEmail}!`,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        avatarColor: user.avatarColor || '#3b82f6',
        avatarIcon: user.avatarIcon || providerLower,
        department: user.department || 'Infotact Engineering',
        location: user.location,
        status: user.status || 'online'
      }
    });
  } catch (error) {
    console.error('Social Login Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error occurred during social login.'
    });
  }
});

function providerUpper(p) {
  if (p === 'google') return 'Google';
  if (p === 'facebook') return 'Facebook';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// ==========================================
// 4. GET /api/auth/me (Protected)
// ==========================================
router.get('/me', authenticateToken, async (req, res) => {
  try {
    let user = null;
    try {
      user = await User.findById(req.user.id).select('-password');
    } catch (e) {
      for (const u of inMemoryUsers.values()) {
        if (u._id === req.user.id) {
          const { password, ...safeUser } = u;
          user = safeUser;
          break;
        }
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    return res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user session.' });
  }
});

// ==========================================
// 5. GET /api/auth/demo-accounts
// ==========================================
router.get('/demo-accounts', (req, res) => {
  return res.status(200).json({
    success: true,
    accounts: [
      {
        name: 'Dr. Aris Thorne',
        identifier: 'aris.thorne@gmail.com',
        role: 'Audio Engineer',
        avatarColor: '#6366f1',
        description: 'Web Audio API & 3D Spatial Audio Lead'
      },
      {
        name: 'Priya Sharma',
        identifier: 'priya.sharma@gmail.com',
        role: 'Developer',
        avatarColor: '#10b981',
        description: 'React Canvas & WebRTC Specialist'
      },
      {
        name: 'Rohan Mehta',
        identifier: 'rohan.mehta@gmail.com',
        role: 'Product Manager',
        avatarColor: '#f59e0b',
        description: 'Infotact Virtual Office Coordinator'
      }
    ]
  });
});

module.exports = router;

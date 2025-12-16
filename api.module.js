// api.module.js - Backend ES6 completo para tienda JULG con seguridad mejorada
// ============================================================================

// 1. UTILIDADES Y HELPERS
const _get = (key, fallback) => { 
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
};

const _set = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Error al guardar:', e);
  }
};

const _now = () => Date.now();

// Hash simple para contraseñas
const _hashPassword = (pwd) => {
  let hash = 0;
  for (let i = 0; i < pwd.length; i++) {
    const char = pwd.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

// Validación de email
const _isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Sanitización
const _sanitizeInput = (input) => String(input || '').trim().substring(0, 255);

// Generador de token
const _generateTempToken = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// 2. INICIALIZACIÓN
function _ensureDefaults() {
  if (!_get('users', null)) {
    _set('users', [{
      id: 1,
      email: 'admin@julg.com',
      passwordHash: _hashPassword('admin'),
      firstName: 'Admin',
      lastName: 'JULG',
      role: 'admin',
      createdAt: new Date().toISOString(),
      settings: { emailNotifications: true, twoFactorEnabled: false }
    }]);
  }

  if (!_get('courses', null)) {
    _set('courses', [
      {
        id: 1001,
        title: 'Introducción a Contabilidad',
        description: 'Curso básico para empezar',
        price: 120,
        priceOffer: 99,
        category: 'Contabilidad',
        status: 'active',
        image: 'https://placehold.co/600x400?text=Contabilidad',
        stock: 999,
        rating: 4.5,
        reviews: 12,
        createdAt: new Date().toISOString()
      },
      {
        id: 1002,
        title: 'Impuestos Avanzados',
        description: 'Domina estrategias fiscales',
        price: 250,
        priceOffer: 199,
        category: 'Fiscal',
        status: 'active',
        image: 'https://placehold.co/600x400?text=Impuestos',
        stock: 999,
        rating: 4.8,
        reviews: 25,
        createdAt: new Date().toISOString()
      }
    ]);
  }

  if (!_get('orders', null)) _set('orders', []);
  if (!_get('carts', null)) _set('carts', {});
  if (!_get('members', null)) _set('members', []);
  if (!_get('coupons', null)) {
    _set('coupons', [{
      id: 1,
      code: 'WELCOME10',
      discount: 10,
      type: 'percentage',
      maxUses: 100,
      usedCount: 0,
      minPurchase: 0,
      applicableCategories: [],
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      status: 'active'
    }]);
  }
  if (!_get('resources', null)) _set('resources', []);
  if (!_get('categories', null)) _set('categories', ['Contabilidad', 'Fiscal', 'Programación', 'Marketing']);
  if (!_get('storeSettings', null)) {
    _set('storeSettings', {
      storeName: 'JULG',
      taxRate: 0.21,
      shippingCost: 0,
      currency: 'ARS'
    });
  }
  if (!_get('resetTokens', null)) _set('resetTokens', []);
}

_ensureDefaults();

const _currentUser = () => _get('currentUser', null);
const _setCurrentUser = (u) => _set('currentUser', u);

function _courseToProduct(course) {
  return {
    id: course.id,
    name: course.title || 'Sin título',
    description: course.description || '',
    price: Number(course.price || 0),
    priceOffer: Number(course.priceOffer || 0) || null,
    image: course.image || 'https://placehold.co/600x400?text=Curso',
    category: course.category || 'General',
    stock: Number(course.stock || 999),
    status: course.status || 'active',
    modules: course.modules || [],
    rating: course.rating || 0,
    reviews: course.reviews || 0,
    createdAt: course.createdAt
  };
}

// 3. AUTENTICACIÓN
export async function apiRegister(email, password, firstName = '', lastName = '') {
  email = _sanitizeInput(email).toLowerCase();
  password = _sanitizeInput(password);
  firstName = _sanitizeInput(firstName);
  lastName = _sanitizeInput(lastName);

  if (!email || !password) throw new Error('Email y contraseña requeridos');
  if (!_isValidEmail(email)) throw new Error('Email inválido');
  if (password.length < 6) throw new Error('Contraseña mínimo 6 caracteres');

  const users = _get('users', []);
  if (users.some(u => u.email === email)) throw new Error('Email ya registrado');

  const id = Math.max(...users.map(u => u.id || 0), 0) + 1;
  const newUser = {
    id,
    email,
    passwordHash: _hashPassword(password),
    firstName,
    lastName,
    role: 'member',
    createdAt: new Date().toISOString(),
    settings: { emailNotifications: true }
  };

  users.push(newUser);
  _set('users', users);

  const carts = _get('carts', {});
  carts[id] = { items: [], appliedCoupon: null };
  _set('carts', carts);

  return { id, email, firstName, lastName, role: 'member' };
}

export async function apiLogin(email, password) {
  email = _sanitizeInput(email).toLowerCase();
  password = _sanitizeInput(password);

  if (!email || !password) throw new Error('Email y contraseña requeridos');

  const users = _get('users', []);
  const user = users.find(u => u.email === email);

  if (!user || user.passwordHash !== _hashPassword(password)) {
    throw new Error('Credenciales inválidas');
  }

  const safeUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName
  };

  _setCurrentUser(safeUser);

  const carts = _get('carts', {});
  if (!carts[user.id]) {
    carts[user.id] = { items: [], appliedCoupon: null };
  }
  _set('carts', carts);

  return safeUser;
}

export async function apiLogout() {
  _set('currentUser', null);
  return true;
}

export function isLoggedIn() {
  return !!_currentUser();
}

export async function apiRequestPasswordReset(email) {
  email = _sanitizeInput(email).toLowerCase();
  const users = _get('users', []);
  const user = users.find(u => u.email === email);

  if (!user) {
    return { message: 'Si el email existe, recibirá enlace' };
  }

  const token = _generateTempToken();
  const resetTokens = _get('resetTokens', []);
  resetTokens.push({
    token,
    userId: user.id,
    email: user.email,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    used: false
  });
  _set('resetTokens', resetTokens);

  console.log(`[DEMO] Token: ${token}`);
  return { message: 'Enlace enviado', token };
}

export async function apiResetPassword(token, newPassword) {
  token = _sanitizeInput(token);
  newPassword = _sanitizeInput(newPassword);

  if (!newPassword || newPassword.length < 6) {
    throw new Error('Contraseña mínimo 6 caracteres');
  }

  const resetTokens = _get('resetTokens', []);
  const resetToken = resetTokens.find(t => t.token === token && !t.used);

  if (!resetToken || new Date(resetToken.expiresAt) < new Date()) {
    throw new Error('Token expirado');
  }

  const users = _get('users', []);
  const userIndex = users.findIndex(u => u.id === resetToken.userId);
  if (userIndex < 0) throw new Error('Usuario no encontrado');

  users[userIndex].passwordHash = _hashPassword(newPassword);
  _set('users', users);
  resetToken.used = true;
  _set('resetTokens', resetTokens);

  return { message: 'Contraseña actualizada' };
}

// 4. PERFIL
export async function apiGetProfile() {
  const user = _currentUser();
  if (!user) throw new Error('No autenticado');

  const users = _get('users', []);
  const fullUser = users.find(u => u.id === user.id);
  if (!fullUser) throw new Error('No encontrado');

  return {
    id: fullUser.id,
    email: fullUser.email,
    firstName: fullUser.firstName,
    lastName: fullUser.lastName,
    role: fullUser.role,
    settings: fullUser.settings,
    createdAt: fullUser.createdAt
  };
}

export async function apiUpdateProfile(firstName, lastName, email) {
  const user = _currentUser();
  if (!user) throw new Error('No autenticado');

  firstName = _sanitizeInput(firstName);
  lastName = _sanitizeInput(lastName);
  email = _sanitizeInput(email).toLowerCase();

  if (!_isValidEmail(email)) throw new Error('Email inválido');

  const users = _get('users', []);
  const userIndex = users.findIndex(u => u.id === user.id);
  if (userIndex < 0) throw new Error('No encontrado');

  if (users.some(u => u.email === email && u.id !== user.id)) {
    throw new Error('Email en uso');
  }

  users[userIndex].firstName = firstName;
  users[userIndex].lastName = lastName;
  users[userIndex].email = email;
  _set('users', users);

  const updated = {
    id: user.id,
    firstName,
    lastName,
    email,
    role: user.role
  };
  _setCurrentUser(updated);
  return updated;
}

export async function apiChangePassword(currentPassword, newPassword) {
  const user = _currentUser();
  if (!user) throw new Error('No autenticado');

  currentPassword = _sanitizeInput(currentPassword);
  newPassword = _sanitizeInput(newPassword);

  if (!newPassword || newPassword.length < 6) {
    throw new Error('Nueva contraseña mínimo 6 caracteres');
  }

  const users = _get('users', []);
  const userIndex = users.findIndex(u => u.id === user.id);
  if (userIndex < 0) throw new Error('No encontrado');

  if (users[userIndex].passwordHash !== _hashPassword(currentPassword)) {
    throw new Error('Contraseña actual incorrecta');
  }

  users[userIndex].passwordHash = _hashPassword(newPassword);
  _set('users', users);
  return { message: 'Contraseña actualizada' };
}

export async function apiUpdateUserSettings(settings) {
  const user = _currentUser();
  if (!user) throw new Error('No autenticado');

  const users = _get('users', []);
  const userIndex = users.findIndex(u => u.id === user.id);
  if (userIndex < 0) throw new Error('No encontrado');

  users[userIndex].settings = { ...users[userIndex].settings, ...settings };
  _set('users', users);
  return users[userIndex].settings;
}

// 4.5 CURSOS COMPRADOS DEL USUARIO ACTUAL
export async function apiGetMyPurchasedCourses() {
  const user = _currentUser();
  if (!user) throw new Error('No autenticado');

  const members = _get('members', []);
  const currentMember = members.find(m => m.email === user.email);
  
  if (!currentMember) {
    return { courses: [], spent: 0, lastPurchase: null };
  }

  // Obtener detalles de los cursos comprados
  const allCourses = _get('courses', []);
  const purchasedCourses = (currentMember.courses || []).map(courseName => {
    const courseInfo = allCourses.find(c => c.title === courseName);
    return {
      name: courseName,
      id: courseInfo?.id,
      description: courseInfo?.description,
      image: courseInfo?.image,
      progress: 0 // Inicialmente 0
    };
  });

  return {
    courses: purchasedCourses,
    spent: currentMember.spent || 0,
    lastPurchase: currentMember.lastPurchase,
    totalCourses: purchasedCourses.length
  };
}

// 5. PRODUCTOS
export async function apiGetProducts() {
  const courses = _get('courses', []);
  return courses.filter(c => c.status !== 'inactive').map(_courseToProduct);
}

export async function apiGetProduct(productId) {
  const course = _get('courses', []).find(c => c.id == productId);
  if (!course) throw new Error('Producto no encontrado');
  return _courseToProduct(course);
}

// 6. CARRITO
function _getCartForCurrent() {
  const user = _currentUser();
  if (!user) throw new Error('Sesión requerida');

  const carts = _get('carts', {});
  if (!carts[user.id]) {
    carts[user.id] = { items: [], appliedCoupon: null };
    // Persistir inmediatamente el carrito creado para el usuario
    _set('carts', carts);
  }
  return carts[user.id];
}

export async function apiGetCart() {
  const cart = _getCartForCurrentOrAnonymous();
  const user = _currentUser();

  const items = cart.items.map(it => {
    const product = _get('courses', []).find(p => p.id == it.productId);
    return {
      id: it.id,
      quantity: it.quantity,
      product: product ? _courseToProduct(product) : null
    };
  }).filter(i => i.product);

  const subtotal = items.reduce((a, i) => a + ((i.product.priceOffer || i.product.price) * i.quantity), 0);
  const discountAmount = cart.appliedCoupon?.amount || 0;
  const total = items.length > 0 ? Math.max(1, subtotal - discountAmount) : 0;

  return {
    items,
    subtotal,
    tax: 0,
    shipping: 0,
    discount: discountAmount,
    appliedCoupon: cart.appliedCoupon ? { code: cart.appliedCoupon.code, discount: cart.appliedCoupon.discount } : null,
    total,
    count: items.reduce((a, i) => a + i.quantity, 0),
    isAnonymous: !user
  };
}

// HELPERS PARA CARRITO ANÓNIMO
function _getAnonymousCart() {
  // Carrito para usuario no logueado (se guarda con ID especial)
  const carts = _get('carts', {});
  if (!carts['__anonymous__']) {
    carts['__anonymous__'] = { items: [], appliedCoupon: null };
    _set('carts', carts);
  }
  return carts['__anonymous__'];
}

function _getCartForCurrentOrAnonymous() {
  const user = _currentUser();
  if (user) {
    return _getCartForCurrent();
  } else {
    return _getAnonymousCart();
  }
}

export async function apiAddToCart(productId, qty = 1) {
  productId = Number(productId);
  qty = Math.max(1, Number(qty));

  const product = _get('courses', []).find(p => p.id === productId);
  if (!product) throw new Error('Producto no encontrado');

  if (product.stock < qty && product.stock >= 0) {
    throw new Error(`Stock: ${product.stock}`);
  }

  const cart = _getCartForCurrentOrAnonymous();

  const existing = cart.items.find(i => i.productId === productId);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.items.push({
      id: _now() + Math.floor(Math.random() * 10000),
      productId,
      quantity: qty
    });
  }

  // Guardar carrito
  const carts = _get('carts', {});
  const user = _currentUser();
  carts[user ? user.id : '__anonymous__'] = cart;
  _set('carts', carts);

  return { ok: true, message: 'Agregado' };
}

export async function apiUpdateCartItem(itemId, qty) {
  qty = Number(qty);
  if (qty <= 0) {
    return apiRemoveFromCart(itemId);
  }

  const cart = _getCartForCurrentOrAnonymous();
  const item = cart.items.find(i => i.id === itemId);
  if (!item) throw new Error('Ítem no encontrado');

  const product = _get('courses', []).find(p => p.id === item.productId);
  if (product && product.stock >= 0 && product.stock < qty) {
    throw new Error(`Stock: ${product.stock}`);
  }

  item.quantity = qty;
  
  // Guardar carrito
  const carts = _get('carts', {});
  const user = _currentUser();
  carts[user ? user.id : '__anonymous__'] = cart;
  _set('carts', carts);

  return { ok: true };
}

export async function apiRemoveFromCart(itemId) {
  const cart = _getCartForCurrentOrAnonymous();
  cart.items = cart.items.filter(i => i.id !== itemId);
  
  // Guardar carrito
  const carts = _get('carts', {});
  const user = _currentUser();
  carts[user ? user.id : '__anonymous__'] = cart;
  _set('carts', carts);

  return { ok: true };
}

export async function apiClearCart() {
  const carts = _get('carts', {});
  const user = _currentUser();
  carts[user ? user.id : '__anonymous__'] = { items: [], appliedCoupon: null };
  _set('carts', carts);

  return { ok: true };
}

// 7. CUPONES
export async function apiGetCoupons() {
  return _get('coupons', []);
}

export async function apiApplyCoupon(code) {
  code = _sanitizeInput(code).toUpperCase();

  const coupons = _get('coupons', []);
  const coupon = coupons.find(c => c.code === code);

  if (!coupon) throw new Error('Cupón no válido');
  if (coupon.status !== 'active') throw new Error('Cupón inactivo');

  const now = new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    throw new Error('No válido aún');
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    throw new Error('Expirado');
  }

  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    throw new Error('Cupón agotado');
  }

  if (coupon.applicableCategories?.length > 0) {
    const cart = _getCartForCurrentOrAnonymous();
    const hasValidCategory = cart.items.some(i => {
      const prod = _get('courses', []).find(p => p.id === i.productId);
      return prod && coupon.applicableCategories.includes(prod.category);
    });
    if (!hasValidCategory) throw new Error('No aplica a tus productos');
  }

  const cart = _getCartForCurrentOrAnonymous();
  const subtotal = cart.items.reduce((a, i) => {
    const prod = _get('courses', []).find(p => p.id === i.productId);
    return a + ((prod?.priceOffer || prod?.price || 0) * i.quantity);
  }, 0);

  if (coupon.minPurchase && subtotal < coupon.minPurchase) {
    throw new Error(`Mínimo: $${coupon.minPurchase}`);
  }

  let discountAmount = 0;
  if (coupon.type === 'percentage') {
    discountAmount = subtotal * (coupon.discount / 100);
  } else if (coupon.type === 'fixed') {
    discountAmount = coupon.discount;
  }

  // Limitar el descuento para que el total NO sea negativo (mínimo $1)
  const maxDiscount = Math.max(0, subtotal - 1); // Dejar mínimo $1
  discountAmount = Math.min(discountAmount, maxDiscount);

  const carts = _get('carts', {});
  const user = _currentUser();
  const cartKey = user ? user.id : '__anonymous__';
  carts[cartKey].appliedCoupon = {
    code: coupon.code,
    discount: coupon.discount,
    type: coupon.type,
    amount: discountAmount,
    couponId: coupon.id
  };
  _set('carts', carts);

  coupon.usedCount = (coupon.usedCount || 0) + 1;
  _set('coupons', coupons);

  return { ok: true, message: `Descuento: -$${discountAmount.toFixed(2)}` };
}

export async function apiRemoveCoupon() {
  const user = _currentUser();
  if (!user) throw new Error('No autenticado');

  const carts = _get('carts', {});
  if (carts[user.id]) {
    carts[user.id].appliedCoupon = null;
    _set('carts', carts);
  }

  return { ok: true };
}

export async function apiCreateCoupon(couponData) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const coupons = _get('coupons', []);
  const id = _now();

  const newCoupon = {
    id,
    code: _sanitizeInput(couponData.code || '').toUpperCase(),
    discount: Number(couponData.discount || 0),
    type: couponData.type || 'percentage',
    maxUses: Number(couponData.maxUses || 0),
    usedCount: 0,
    minPurchase: Number(couponData.minPurchase || 0),
    applicableCategories: couponData.applicableCategories || [],
    validFrom: couponData.validFrom || new Date().toISOString(),
    validUntil: couponData.validUntil || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    status: couponData.status || 'active'
  };

  coupons.push(newCoupon);
  _set('coupons', coupons);

  return newCoupon;
}

export async function apiDeleteCoupon(id) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const coupons = _get('coupons', []);
  const filtered = coupons.filter(c => c.id !== Number(id));
  _set('coupons', filtered);

  return { ok: true };
}

// 8. ÓRDENES/CHECKOUT
export async function apiCreateOrder(shippingInfo = {}) {
  const user = _currentUser();
  if (!user) throw new Error('Inicia sesión');

  const carts = _get('carts', {});
  const cart = carts[user.id] || { items: [], appliedCoupon: null };

  if (!cart.items.length) throw new Error('Carrito vacío');

  // Validar stock
  let subtotal = 0;
  let items = [];

  for (const item of cart.items) {
    const product = _get('courses', []).find(p => p.id === item.productId);
    if (!product) throw new Error(`Producto ${item.productId} no encontrado`);
    if (product.stock >= 0 && product.stock < item.quantity) {
      throw new Error(`Stock insuficiente: ${product.title}`);
    }

    const unitPrice = product.priceOffer || product.price;
    const itemTotal = unitPrice * item.quantity;
    subtotal += itemTotal;

    items.push({
      productId: product.id,
      productName: product.title,
      quantity: item.quantity,
      unitPrice,
      total: itemTotal
    });
  }

  const store = _get('storeSettings', {});
  const taxRate = store.taxRate || 0.21;
  const tax = subtotal * taxRate;
  const shipping = store.shippingCost || 0;
  let discountAmount = 0;

  if (cart.appliedCoupon) {
    discountAmount = cart.appliedCoupon.amount || 0;
  }

  const total = Math.max(0, subtotal + tax + shipping - discountAmount);

  const orderId = _now();
  const order = {
    id: orderId,
    userId: user.id,
    userEmail: user.email,
    items,
    subtotal,
    tax,
    shipping,
    discount: discountAmount,
    appliedCoupon: cart.appliedCoupon ? { code: cart.appliedCoupon.code, amount: discountAmount } : null,
    total,
    status: 'completed',
    shippingInfo: {
      address: _sanitizeInput(shippingInfo.address || ''),
      city: _sanitizeInput(shippingInfo.city || ''),
      postalCode: _sanitizeInput(shippingInfo.postalCode || ''),
      country: _sanitizeInput(shippingInfo.country || 'Argentina')
    },
    createdAt: new Date().toISOString(),
    estimatedDelivery: new Date(Date.now() + 7*24*60*60*1000).toISOString()
  };

  const orders = _get('orders', []);
  orders.unshift(order);
  _set('orders', orders);

  // Actualizar miembros
  const members = _get('members', []);
  const memberIndex = members.findIndex(m => m.email === user.email);

  if (memberIndex >= 0) {
    members[memberIndex].courses = members[memberIndex].courses.concat(items.map(i => i.productName));
    members[memberIndex].spent = (members[memberIndex].spent || 0) + total;
    members[memberIndex].lastPurchase = new Date().toISOString();
  } else {
    members.push({
      id: user.id,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email,
      status: 'active',
      courses: items.map(i => i.productName),
      spent: total,
      lastPurchase: new Date().toISOString()
    });
  }
  _set('members', members);

  carts[user.id] = { items: [], appliedCoupon: null };
  _set('carts', carts);

  return { ok: true, orderId: order.id, order };
}

export async function apiGetOrders() {
  const user = _currentUser();
  if (!user) throw new Error('No autenticado');

  const orders = _get('orders', []);

  if (user.role === 'admin') {
    return orders;
  }

  return orders.filter(o => o.userId === user.id);
}

export async function apiGetOrderDetail(orderId) {
  const user = _currentUser();
  if (!user) throw new Error('No autenticado');

  const orders = _get('orders', []);
  const order = orders.find(o => o.id === Number(orderId));

  if (!order) throw new Error('Orden no encontrada');

  if (user.role !== 'admin' && order.userId !== user.id) {
    throw new Error('No tienes permiso');
  }

  return order;
}

// 9. ADMIN - PRODUCTOS
export async function apiGetAllCourses() {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');
  return _get('courses', []);
}

export async function apiCreateCourse(courseData) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const courses = _get('courses', []);
  const id = Math.max(...courses.map(c => c.id || 0), 1000) + 1;

  const newCourse = {
    id,
    title: _sanitizeInput(courseData.title || 'Sin título'),
    description: _sanitizeInput(courseData.description || ''),
    price: Number(courseData.price || 0),
    priceOffer: Number(courseData.priceOffer || 0) || null,
    category: courseData.category || 'General',
    stock: Number(courseData.stock || 999),
    status: courseData.status || 'active',
    modules: courseData.modules || [],
    image: courseData.image || 'https://placehold.co/600x400?text=Curso',
    rating: 0,
    reviews: 0,
    createdAt: new Date().toISOString()
  };

  courses.push(newCourse);
  _set('courses', courses);

  return newCourse;
}

export async function apiUpdateCourse(id, updates) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const courses = _get('courses', []);
  const idx = courses.findIndex(c => c.id === Number(id));

  if (idx < 0) throw new Error('Curso no encontrado');

  const sanitized = {
    title: updates.title ? _sanitizeInput(updates.title) : courses[idx].title,
    description: updates.description ? _sanitizeInput(updates.description) : courses[idx].description,
    price: typeof updates.price !== 'undefined' ? Number(updates.price) : courses[idx].price,
    priceOffer: typeof updates.priceOffer !== 'undefined' ? Number(updates.priceOffer) : courses[idx].priceOffer,
    category: updates.category || courses[idx].category,
    stock: typeof updates.stock !== 'undefined' ? Number(updates.stock) : courses[idx].stock,
    status: updates.status || courses[idx].status,
    image: updates.image || courses[idx].image
  };

  courses[idx] = { ...courses[idx], ...sanitized };
  _set('courses', courses);

  return courses[idx];
}

export async function apiDeleteCourse(id) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const courses = _get('courses', []);
  const filtered = courses.filter(c => c.id !== Number(id));
  _set('courses', filtered);

  return { ok: true };
}

// 10. ADMIN - RECURSOS
export async function apiGetResources() {
  return _get('resources', []);
}

export async function apiCreateResource({ name, type, dataUrl }) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const resources = _get('resources', []);
  const id = _now();

  const newResource = {
    id,
    name: _sanitizeInput(name || 'Recurso'),
    type: _sanitizeInput(type || 'image'),
    dataUrl,
    createdAt: new Date().toISOString()
  };

  resources.push(newResource);
  _set('resources', resources);

  return newResource;
}

export async function apiDeleteResource(id) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const resources = _get('resources', []);
  const filtered = resources.filter(r => r.id !== Number(id));
  _set('resources', filtered);

  return { ok: true };
}

// 11. ADMIN - CATEGORÍAS
export async function apiGetCategories() {
  return _get('categories', []);
}

export async function apiAddCategory(name) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  name = _sanitizeInput(name);
  const categories = _get('categories', []);

  if (!categories.includes(name)) {
    categories.push(name);
    _set('categories', categories);
  }

  return categories;
}

export async function apiDeleteCategory(name) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const categories = _get('categories', []);
  const filtered = categories.filter(c => c !== name);
  _set('categories', filtered);

  return filtered;
}

// 12. ADMIN - MIEMBROS
export async function apiGetMembers() {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');
  return _get('members', []);
}

export async function apiUpdateMemberStatus(email, status) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const members = _get('members', []);
  const idx = members.findIndex(m => m.email === email);

  if (idx < 0) throw new Error('Miembro no encontrado');

  members[idx].status = status;
  _set('members', members);

  return members[idx];
}

// 13. ADMIN - ESTADÍSTICAS
export async function apiGetDashboardStats() {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const orders = _get('orders', []);
  const members = _get('members', []);
  const courses = _get('courses', []);

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const totalOrders = orders.length;
  const totalMembers = members.length;
  const totalProducts = courses.filter(c => c.status !== 'inactive').length;

  return {
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalOrders,
    totalMembers,
    totalProducts
  };
}

// 14. CONFIGURACIÓN
export async function apiGetStoreSettings() {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');
  return _get('storeSettings', {});
}

export async function apiUpdateStoreSettings(settings) {
  const user = _currentUser();
  if (!user || user.role !== 'admin') throw new Error('No autorizado');

  const current = _get('storeSettings', {});
  const updated = { ...current, ...settings };
  _set('storeSettings', updated);

  return updated;
}

// 15. EXPORTS
if (typeof window !== 'undefined') {
  window.API = {
    apiRegister, apiLogin, apiLogout, isLoggedIn,
    apiRequestPasswordReset, apiResetPassword,
    apiGetProfile, apiUpdateProfile, apiChangePassword, apiUpdateUserSettings, apiGetMyPurchasedCourses,
    apiGetProducts, apiGetProduct,
    apiGetCart, apiAddToCart, apiUpdateCartItem, apiRemoveFromCart, apiClearCart,
    apiGetCoupons, apiApplyCoupon, apiRemoveCoupon, apiCreateCoupon, apiDeleteCoupon,
    apiCreateOrder, apiGetOrders, apiGetOrderDetail,
    apiGetAllCourses, apiCreateCourse, apiUpdateCourse, apiDeleteCourse,
    apiGetResources, apiCreateResource, apiDeleteResource,
    apiGetCategories, apiAddCategory, apiDeleteCategory,
    apiGetMembers, apiUpdateMemberStatus,
    apiGetDashboardStats,
    apiGetStoreSettings, apiUpdateStoreSettings
  };
}

export default {
  apiRegister, apiLogin, apiLogout, isLoggedIn,
  apiRequestPasswordReset, apiResetPassword,
  apiGetProfile, apiUpdateProfile, apiChangePassword, apiUpdateUserSettings, apiGetMyPurchasedCourses,
  apiGetProducts, apiGetProduct,
  apiGetCart, apiAddToCart, apiUpdateCartItem, apiRemoveFromCart, apiClearCart,
  apiGetCoupons, apiApplyCoupon, apiRemoveCoupon, apiCreateCoupon, apiDeleteCoupon,
  apiCreateOrder, apiGetOrders, apiGetOrderDetail,
  apiGetAllCourses, apiCreateCourse, apiUpdateCourse, apiDeleteCourse,
  apiGetResources, apiCreateResource, apiDeleteResource,
  apiGetCategories, apiAddCategory, apiDeleteCategory,
  apiGetMembers, apiUpdateMemberStatus,
  apiGetDashboardStats,
  apiGetStoreSettings, apiUpdateStoreSettings
};

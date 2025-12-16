// API simulado en cliente - usa localStorage para persistencia
// Exporta funciones para módulo ES y también asigna window.API para compatibilidad con scripts no módulos
(function(){
  // Helpers
  function _get(key, fallback) { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  function _set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function _now() { return Date.now(); }

  // Defaults
  function _ensureDefaults() {
    if(!_get('users', null)) {
      _set('users', [
        { id: 1, email: 'admin@julg.com', password: 'admin', firstName: 'Admin', lastName: 'JULG', role: 'admin' },
        { id: 2, email: 'user@example.com', password: 'password', firstName: 'Usuario', lastName: 'Demo', role: 'member' }
      ]);
    }

    if(!_get('courses', null)) {
      _set('courses', [
        { id: 1001, title: 'Introducción a Contabilidad', desc: 'Curso básico para empezar', price: 120, priceOffer: 99, category: 'Contabilidad', modules: [], status: 'active', image: 'https://placehold.co/600x400?text=Contabilidad' },
        { id: 1002, title: 'Impuestos Avanzados', desc: 'Aprende a dominar impuestos', price: 250, priceOffer: 199, category: 'Fiscal', modules: [], status: 'active', image: 'https://placehold.co/600x400?text=Impuestos' }
      ]);
    }

    if(!_get('orders', null)) { _set('orders', []); }
    if(!_get('coupons', null)) { _set('coupons', []); }
    if(!_get('categories', null)) { _set('categories', ['Contabilidad', 'Fiscal', 'Programación', 'Marketing']); }
  }

  _ensureDefaults();

  // Current user session (stored in localStorage)
  function _currentUser() { return _get('currentUser', null); }
  function _setCurrentUser(u) { _set('currentUser', u); }

  // Normalize course to product expected by frontends
  function _courseToProduct(course) {
    return {
      id: course.id,
      name: course.title || course.name || 'Sin título',
      description: course.desc || course.description || '',
      price: Number(course.price || 0),
      priceOffer: Number(course.priceOffer || 0) || null,
      image: course.image || course.cover || course.videoPromo || 'https://placehold.co/600x400?text=Curso',
      category: course.category || 'General',
      stock: typeof course.stock !== 'undefined' ? Number(course.stock) : 999,
      status: course.status || 'active',
      modules: course.modules || [],
      raw: course
    };
  }

  // API impl
  async function apiGetProducts() {
    const courses = _get('courses', []);
    const products = courses.filter(c => c.status !== 'inactive').map(_courseToProduct);
    return products;
  }

  async function apiGetProduct(productId) {
    const courses = _get('courses', []);
    const course = courses.find(c => c.id == productId);
    if(!course) throw new Error('Curso no encontrado');
    return _courseToProduct(course);
  }

  // Users
  async function apiRegister(email, password, firstName = '', lastName = '') {
    const users = _get('users', []);
    if (!email || !password) throw new Error('Email y contraseña requeridos');
    if (users.some(u => u.email === email)) throw new Error('El email ya existe');
    const id = users.reduce((acc, u) => Math.max(acc, u.id || 0), 0) + 1;
    const newUser = { id, email, password, firstName, lastName, role: 'member' };
    users.push(newUser);
    _set('users', users);
    return newUser;
  }

  async function apiLogin(email, password) {
    const users = _get('users', []);
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) throw new Error('Credenciales inválidas');
    // No almacenar contraseñas en producción. Aquí es fine para demo
    const safeUser = { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName };
    _setCurrentUser(safeUser);
    // Initialize cart if not exists
    const carts = _get('carts', {});
    if (!carts[user.id]) carts[user.id] = { items: [], total: 0 };
    _set('carts', carts);
    return safeUser;
  }

  async function apiLogout() {
    _set('currentUser', null);
    return true;
  }

  function isLoggedIn() { return !!_currentUser(); }

  function _getCartForCurrent() {
    const user = _currentUser();
    if (!user) throw new Error('No autenticado');
    const carts = _get('carts', {});
    const cart = carts[user.id] || { items: [], total: 0 };
    carts[user.id] = cart;
    _set('carts', carts);
    return cart;
  }

  async function apiGetCart() {
    const cart = _getCartForCurrent();
    // Enhance items with product data
    const items = cart.items.map(it => {
      const product = _get('courses', []).find(p => p.id == it.productId);
      return { id: it.id, quantity: it.quantity, product: _courseToProduct(product) };
    });
    const total = items.reduce((acc, it) => acc + (it.product.price * it.quantity), 0);
    return { items, total };
  }

  async function apiAddToCart(productId, qty = 1) {
    const user = _currentUser();
    if (!user) throw new Error('Debes iniciar sesión para agregar al carrito');
    const product = _get('courses', []).find(p => p.id == productId);
    if (!product) throw new Error('Producto inexistente');
    const carts = _get('carts', {});
    const cart = carts[user.id] || { items: [], total: 0 };
    // add or update
    const existing = cart.items.find(i => i.productId == productId);
    if (existing) existing.quantity += Number(qty);
    else cart.items.push({ id: _now() + Math.floor(Math.random()*1000), productId, quantity: Number(qty) });
    carts[user.id] = cart;
    _set('carts', carts);
    return { ok: true };
  }

  async function apiUpdateCartItem(itemId, qty) {
    const user = _currentUser(); if (!user) throw new Error('No autenticado');
    const carts = _get('carts', {});
    const cart = carts[user.id] || { items: [], total: 0 };
    const existing = cart.items.find(i => i.id == itemId);
    if (!existing) throw new Error('Ítem no encontrado');
    existing.quantity = Number(qty);
    carts[user.id] = cart; _set('carts', carts);
    return { ok: true };
  }

  async function apiRemoveFromCart(itemId) {
    const user = _currentUser(); if (!user) throw new Error('No autenticado');
    const carts = _get('carts', {});
    const cart = carts[user.id] || { items: [], total: 0 };
    cart.items = cart.items.filter(i => i.id != itemId);
    carts[user.id] = cart; _set('carts', carts);
    return { ok: true };
  }

  async function apiCreateOrder() {
    const user = _currentUser(); if (!user) throw new Error('No autenticado');
    const carts = _get('carts', {});
    const cart = carts[user.id] || { items: [], total: 0 };
    if (!cart.items.length) throw new Error('Carrito vacío');
    const items = cart.items.map(i => ({ productId: i.productId, quantity: i.quantity }));
    const order = { id: _now(), userId: user.id, items, total: items.reduce((acc, it) => {
      const p = _get('courses', []).find(c => c.id == it.productId); return acc + (p ? Number(p.price) * it.quantity : 0);
    }, 0), createdAt: new Date().toISOString() };
    const orders = _get('orders', []);
    orders.unshift(order); _set('orders', orders);
    // Add to user's member history
    const members = _get('members', []);
    // If member exists, update; else push
    const mIndex = members.findIndex(m => m.email === user.email);
    if (mIndex >= 0) {
      members[mIndex].courses = members[mIndex].courses.concat(items.map(i => _get('courses', []).find(c => c.id == i.productId)?.title || 'Curso')); 
      members[mIndex].spent = (members[mIndex].spent || 0) + order.total;
    } else {
      members.push({ id: user.id, name: `${user.firstName || ''} ${user.lastName || ''}`.trim(), email: user.email, status: 'active', courses: items.map(i => _get('courses', []).find(c => c.id == i.productId)?.title || 'Curso'), spent: order.total });
    }
    _set('members', members);
    // Clear cart
    carts[user.id] = { items: [], total: 0 }; _set('carts', carts);
    return order;
  }

  // Expose
  const API = { apiGetProducts, apiGetProduct, apiRegister, apiLogin, apiLogout, isLoggedIn, apiGetCart, apiAddToCart, apiUpdateCartItem, apiRemoveFromCart, apiCreateOrder };

  // If in module context, export named members
  try {
    if (typeof window !== 'undefined') window.API = API;
  } catch(e){}

  // If module environment, use exports
  if (typeof exports !== 'undefined') {
    // Node or CommonJS (not used here)
    Object.assign(exports, API);
  }

  // Browser module export (ES module) - define dynamically if supported
  if (typeof document !== 'undefined') {
    const scriptAttrs = document.currentScript && document.currentScript.type === 'module';
    // If this file is imported as a module, modern bundlers will handle exports; to be safe, attach global above
  }

  // For ES modules, provide named exports (not available to plain script execution). We'll create hidden global wrapper to satisfy module imports.
  if (typeof window !== 'undefined') {
    // Create a property that allows destructuring import when loaded as module using standard module loader; this is only used by later import statements.
    // No-op: actual named exports are handled when this file is loaded as ES module.
  }

  // Expose a fallback named export for module environment using dynamic <script type=module> evaluation
  // We'll also export via simple hack for environments that support 'import.meta' etc.
  // No additional action is necessary here: if loaded as ES module, export statements at top would be needed. Instead, to keep compatibility we will rely on explicit module file creation when needed.
  
})();

// If we are in an ES module environment (import ... from './api.js'), the above IIFE won't provide named exports.
// To support direct ES module `import { apiGetProducts } from './api.js'`, create a separate ES module wrapper file that re-exports the methods.

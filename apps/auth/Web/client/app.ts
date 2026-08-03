// Auth app — placeholder landing page. The login / create-account UI lands in
// issue #151; for now this just confirms the app is served. Served under the
// /auth/ proxy prefix (stripped before it reaches the app), so any asset/API
// URLs added later must stay RELATIVE.
const status = document.getElementById('status');
if (status) {
  status.textContent = 'Auth service is running. Sign-in comes next (issue #149+).';
}

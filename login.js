const e = new URLSearchParams(location.search).get('e');
const msg = document.getElementById('msg');
if (e === '1') msg.textContent = 'That access level and password did not match.';
if (e === 'wait') msg.textContent = 'Too many attempts. Please wait 15 minutes and try again.';

// Пароль-гейт. Пароль хранится здесь — измените значение ниже на свой.
const DASHBOARD_PASSWORD = 'Barcelona2018';

export function checkPw(){
  const val = document.getElementById('pwInput').value;
  if(val === DASHBOARD_PASSWORD){
    sessionStorage.setItem('alfa_authed','yes');
    document.getElementById('pwgate').style.display='none';
  } else {
    document.getElementById('pwErr').textContent = 'Неверный пароль';
    document.getElementById('pwInput').value = '';
  }
}

// Если уже авторизован в этой сессии — сразу прячем гейт
export function initGate(){
  if(sessionStorage.getItem('alfa_authed')==='yes'){
    const g=document.getElementById('pwgate');
    if(g) g.style.display='none';
  }
}

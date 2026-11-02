import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import {getFirestore,doc,getDocFromServer,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const app=initializeApp({apiKey:'AIzaSyCgFrJCgl5g-q98AVGZavdYtd9w9liI1cQ',authDomain:'calendario-semanal-2fb0e.firebaseapp.com',projectId:'calendario-semanal-2fb0e',appId:'1:477867830761:web:31bd2efb181b0307e9ef78',messagingSenderId:'477867830761'});
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const native=window.localStorage;
const validKey=k=>/^calendario-semanal:(conceptos-personalizados:v1|eliminados:v1|presupuestos:v1|gastos:v1:\d{4}-\d{2}|registros:v1:\d{4}-\d{2})$/.test(k);
let state=Object.create(null),revision=0,ref=null,uid=null,ready=false,dirty=false,saving=false,blocked=false,started=false,stop=null,timer=null,generation=0;
const status=(message,error=false)=>{$('cloud-status').textContent=message;$('cloud-status').style.color=error?'#b42424':'#496480'};
function lock(value){$('calendar-fields').inert=value;$('calendar-fields').style.opacity=value?'.55':'1'}
function decode(payload){
 const value=JSON.parse(payload),out=Object.create(null);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Datos de calendario inválidos');
 for(const [key,text] of Object.entries(value))if(validKey(key)&&typeof text==='string'){JSON.parse(text);out[key]=text}
 return out;
}
function backup(){try{if(uid)native.setItem('calendario-respaldo:'+uid,JSON.stringify(state))}catch{}}
function refresh(){window.dispatchEvent(new Event('calendar-cloud-update'))}
function fail(message){blocked=true;lock(true);backup();try{native.setItem('calendario-recuperacion:'+uid+':'+Date.now(),JSON.stringify(state))}catch{}$('cloud-reload').hidden=false;status(message+' Se conservó una copia local; puedes descargarla antes de recargar.',true)}
window.calendarStorage={
 getItem(key){return Object.hasOwn(state,key)?state[key]:null},
 setItem(key,value){
  if(!ready||blocked||!navigator.onLine)throw Error('No hay conexión de sincronización');
  if(!validKey(key))throw Error('Clave inválida');
  const next={...state,[key]:String(value)};
  if(JSON.stringify(next).length>440000)throw Error('El calendario alcanzó su capacidad');
  state=next;dirty=true;backup();status('Guardando…');clearTimeout(timer);timer=setTimeout(flush,600);
 }
};
async function flush(){
 if(saving||!dirty||blocked||!ref)return;
 saving=true;dirty=false;
 const payload=JSON.stringify(state),base=revision,currentRef=ref,epoch=generation;
 try{
  await runTransaction(db,async tx=>{
   const snap=await tx.get(currentRef),actual=snap.exists()?snap.data().revision:0;
   if(actual!==base)throw Error('CONFLICT');
   tx.set(currentRef,{payload,revision:base+1,updatedAt:serverTimestamp()});
  });
  if(epoch!==generation)return;
  revision=base+1;
  if(!dirty)status('Sincronizado · '+auth.currentUser.email);
 }catch(error){
  console.warn('Sincronización:',error.code||'',error.message);
  if(epoch===generation)fail(error.message==='CONFLICT'||error.code==='permission-denied'?'Otro dispositivo pudo guardar cambios al mismo tiempo. Recarga para recibirlos.':'No se pudieron guardar los cambios en la nube.');
 }finally{saving=false;if(dirty&&!blocked)flush()}
}
function legacy(){const data=Object.create(null);for(let i=0;i<native.length;i++){const key=native.key(i);if(validKey(key)){const value=native.getItem(key);try{JSON.parse(value);data[key]=value}catch{}}}return data}
function hasData(data){return Object.values(data).some(v=>{try{return Object.keys(JSON.parse(v)||{}).length>0}catch{return false}})}
function download(data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='respaldo-calendario-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('cloud-backup').addEventListener('click',()=>download(blocked?state:(ready?state:legacy())));
$('cloud-reload').addEventListener('click',()=>location.reload());
$('cloud-import').addEventListener('click',async()=>{
 if(!ready||blocked||saving||dirty)return;
 if(hasData(state)){status('La cuenta ya contiene datos. No se reemplazaron. Conserva una copia de los datos anteriores con “Descargar respaldo anterior”.',true);return}
 const old=legacy();if(!hasData(old)){status('No hay registros anteriores en este navegador.');return}
 state=old;dirty=true;backup();refresh();await flush();if(!blocked)$('cloud-import').hidden=true;
});
$('legacy-backup').addEventListener('click',()=>download(legacy()));
const errorText=error=>({
 'auth/invalid-credential':'Correo o contraseña incorrectos.',
 'auth/email-already-in-use':'Ese correo ya tiene una cuenta. Pulsa Entrar.',
 'auth/weak-password':'Usa una contraseña de al menos 6 caracteres.',
 'auth/invalid-email':'Revisa el correo electrónico.',
 'auth/network-request-failed':'No hay conexión. Vuelve a intentarlo.',
 'auth/too-many-requests':'Demasiados intentos. Espera unos minutos.',
 'permission-denied':'No se pudo acceder a tus datos. Revisa las reglas de la base de datos.'
}[error.code]||'No se pudo completar la operación. Vuelve a intentarlo.');
async function enter(create){
 const email=$('cloud-email').value.trim(),password=$('cloud-password').value;
 if(!$('cloud-login').reportValidity())return;
 $('cloud-login-error').textContent='Conectando…';
 try{if(create)await createUserWithEmailAndPassword(auth,email,password);else await signInWithEmailAndPassword(auth,email,password);$('cloud-password').value='';$('cloud-login-error').textContent=''}
 catch(e){$('cloud-login-error').textContent=errorText(e)}
}
$('cloud-login').addEventListener('submit',e=>{e.preventDefault();enter(false)});
$('cloud-create').addEventListener('click',()=>enter(true));
$('cloud-reset').addEventListener('click',async()=>{const email=$('cloud-email').value.trim();if(!email){$('cloud-login-error').textContent='Escribe primero tu correo.';return}try{await sendPasswordResetEmail(auth,email);$('cloud-login-error').textContent='Si el correo tiene una cuenta, recibirás instrucciones para recuperar el acceso.'}catch(e){$('cloud-login-error').textContent=errorText(e)}});
$('cloud-signout').addEventListener('click',async()=>{if(saving||dirty){status('Espera a que termine de guardar antes de salir.',true);return}await signOut(auth);location.reload()});
window.addEventListener('beforeunload',e=>{if(dirty||saving||blocked){e.preventDefault();e.returnValue=''}});
window.addEventListener('offline',()=>{lock(true);status('Sin conexión. Reconecta para seguir editando.',true)});
window.addEventListener('online',()=>{if(ready&&!blocked){lock(false);status('Conectado');flush()}});
onAuthStateChanged(auth,async user=>{
 const epoch=++generation;if(stop)stop();ready=false;ref=null;lock(true);
 $('cloud-login').hidden=!!user;$('cloud-account').hidden=!user;$('calendar-fields').hidden=!user;
 if(!user){status('Inicia sesión para sincronizar tus dispositivos.');return}
 uid=user.uid;ref=doc(db,'users',uid,'state','calendar');status('Cargando tus datos…');
 try{
  const snap=await getDocFromServer(ref);if(epoch!==generation)return;
  state=snap.exists()?decode(snap.data().payload):Object.create(null);revision=snap.exists()?snap.data().revision:0;
  ready=true;blocked=false;dirty=false;lock(!navigator.onLine);backup();
  $('cloud-import').hidden=!hasData(legacy());$('legacy-backup').hidden=!hasData(legacy());
  if(!started){started=true;window.startCalendar()}else refresh();
  status('Sincronizado · '+user.email);
  stop=onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
   if(epoch!==generation||snapshot.metadata.hasPendingWrites||snapshot.metadata.fromCache||dirty||saving||blocked)return;
   const data=snapshot.exists()?snapshot.data():null,nextRevision=data?.revision||0;
   if(nextRevision!==revision){try{state=data?decode(data.payload):Object.create(null);revision=nextRevision;backup();refresh();status('Sincronizado · '+user.email)}catch{fail('Los datos recibidos no se pudieron leer.')}}
  },()=>fail('Se interrumpió la sincronización.'));
 }catch(e){status(errorText(e),true);$('cloud-reload').hidden=false}
});


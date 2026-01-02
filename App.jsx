import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  Utensils, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Calendar, 
  BarChart3, 
  TrendingUp, 
  User, 
  Scale, 
  Ruler, 
  Droplet,
  ChevronLeft,
  ChevronRight,
  Save,
  Clock
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'nutriapp-v1';

const EMPTY_LOGS = {
  DESAYUNO: [], 
  'MERIENDA 1': [], 
  ALMUERZO: [], 
  'MERIENDA 2': [], 
  CENA: []
};

// --- CONFIGURACIÓN DE RACIONES DIARIAS ---
const RATIONS_DISTRIBUTION = {
  DESAYUNO: { Lácteos: 1, Almidones: 3, Carnes: 2, Grasas: 2, Frutas: 2 },
  'MERIENDA 1': { Frutas: 1, Almidones: 1 },
  ALMUERZO: { Carnes: 3, Almidones: 4, Vegetales: 3, Grasas: 3 },
  'MERIENDA 2': { Frutas: 1, Almidones: 1 },
  CENA: { Carnes: 3, Almidones: 4, Vegetales: 3, Grasas: 3, Frutas: 3 }
};

const INTERCHANGE_LISTS = {
  Almidones: [
    { name: 'Arroz / Pasta', measure: '1/2 taza' },
    { name: 'Papa / Yuca', measure: '1 unidad/trozo' },
    { name: 'Arepa / Pan', measure: '1 unidad' },
    { name: 'Cereal / Bollo / Hallaca', measure: '1/2 taza / porción' },
    { name: 'Plátano', measure: '1/4 unidad' },
  ],
  Frutas: [
    { name: 'Ciruelas', measure: '2 unidades' },
    { name: 'Cambur / Manzana', measure: '1 mediana' },
    { name: 'Melón / Lechosa / Fresa', measure: '1-2 tazas' },
    { name: 'Jugo Natural', measure: '1 vaso' },
  ],
  Vegetales: [
    { name: 'Vegetales A (Verdes)', measure: '2 tazas' },
    { name: 'Vegetales B (Zanahoria)', measure: '1/2 taza' },
  ],
  Lácteos: [
    { name: 'Leche / Yogurt', measure: '1 taza / 1/2 taza' },
  ],
  Carnes: [
    { name: 'Res / Pollo / Pescado / Cerdo', measure: '60g' },
    { name: 'Huevo entero', measure: '1 unidad' },
    { name: 'Quesos Blancos', measure: '30g' },
  ],
  Grasas: [
    { name: 'Aceite / Mayonesa / Mantequilla', measure: '1 cdta' },
    { name: 'Aguacate', measure: '1/8 unidad' },
    { name: 'Frutos Secos', measure: 'porción' },
  ]
};

const App = () => {
  const [user, setUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState('2026-01-02');
  
  const [userData, setUserData] = useState({ nombre: 'Paciente', peso: 70, estatura: 170 });
  const [waterConsumed, setWaterConsumed] = useState(0);
  
  // Registramos manualmente los datos del 2 de enero solicitados
  const [logs, setLogs] = useState({
    DESAYUNO: [
      { id: 101, name: 'Cereal', group: 'Almidones', qty: 2, measure: '1/2 taza' },
      { id: 102, name: 'Leche', group: 'Lácteos', qty: 1, measure: '1 taza' },
    ],
    'MERIENDA 1': [],
    ALMUERZO: [
      { id: 103, name: 'Cerdo', group: 'Carnes', qty: 2, measure: '60g' },
      { id: 104, name: 'Bollo Navideño (Masa)', group: 'Almidones', qty: 4, measure: 'porción' },
      { id: 105, name: 'Papa (Ensalada)', group: 'Almidones', qty: 1, measure: '1 unidad' },
      { id: 106, name: 'Zanahoria (Ensalada)', group: 'Vegetales', qty: 1, measure: '1/2 taza' },
      { id: 107, name: 'Mayonesa', group: 'Grasas', qty: 2, measure: '1 cdta' },
      { id: 108, name: 'Grasa (Bollo)', group: 'Grasas', qty: 2, measure: '1 cdta' },
    ],
    'MERIENDA 2': [
      { id: 109, name: 'Ciruelas (5 unidades)', group: 'Frutas', qty: 2.5, measure: '2 unidades' }
    ],
    CENA: []
  });
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [form, setForm] = useState({ meal: 'DESAYUNO', group: 'Almidones', index: 0, qty: 1 });

  // 1. Inicialización de Autenticación
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Sincronización de Perfil del Usuario
  useEffect(() => {
    if (!user) return;
    const profileDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'settings');
    const unsubscribe = onSnapshot(profileDoc, (snapshot) => {
      if (snapshot.exists()) {
        setUserData(snapshot.data());
      }
    });
    return () => unsubscribe();
  }, [user]);

  // 3. Sincronización de Logs Diarios con Limpieza al cambiar de fecha
  useEffect(() => {
    if (!user) return;
    
    const dayDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'dailyLogs', selectedDate);
    
    const unsubscribe = onSnapshot(dayDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setLogs(data.logs || EMPTY_LOGS);
        setWaterConsumed(data.water || 0);
      } else {
        // Solo limpiamos si no es la fecha que acabamos de setear con el reporte del usuario
        if (selectedDate !== '2026-01-02') {
            setLogs(EMPTY_LOGS);
            setWaterConsumed(0);
        }
      }
    });

    return () => unsubscribe();
  }, [user, selectedDate]);

  // Cálculos de IMC y Balance
  const bmi = useMemo(() => {
    const h = userData.estatura / 100;
    return h > 0 ? (userData.peso / (h * h)).toFixed(1) : 0;
  }, [userData]);

  const dailyTotalTargets = useMemo(() => {
    const totals = {};
    Object.values(RATIONS_DISTRIBUTION).forEach(meal => {
      Object.entries(meal).forEach(([group, target]) => {
        totals[group] = (totals[group] || 0) + target;
      });
    });
    return totals;
  }, []);

  const dailyConsumed = useMemo(() => {
    const totals = {};
    Object.keys(dailyTotalTargets).forEach(g => totals[g] = 0);
    Object.values(logs).flat().forEach(item => {
      totals[item.group] = (totals[item.group] || 0) + item.qty;
    });
    return totals;
  }, [logs, dailyTotalTargets]);

  // Funciones para guardar datos
  const saveDailyData = async (newLogs, newWater) => {
    if (!user) return;
    setIsSyncing(true);
    const dayDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'dailyLogs', selectedDate);
    try {
      await setDoc(dayDoc, { logs: newLogs, water: newWater }, { merge: true });
    } catch (e) {
      console.error("Error al guardar en Firestore:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveProfile = async (newData) => {
    if (!user) return;
    const profileDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'settings');
    await setDoc(profileDoc, newData);
  };

  const addFood = () => {
    const foodItem = INTERCHANGE_LISTS[form.group][form.index];
    const newEntry = {
      id: Date.now(),
      name: foodItem.name,
      measure: foodItem.measure,
      group: form.group,
      qty: Number(form.qty)
    };
    const updatedLogs = { ...logs, [form.meal]: [...logs[form.meal], newEntry] };
    setLogs(updatedLogs);
    saveDailyData(updatedLogs, waterConsumed);
  };

  const removeFood = (meal, id) => {
    const updatedLogs = { ...logs, [meal]: logs[meal].filter(item => item.id !== id) };
    setLogs(updatedLogs);
    saveDailyData(updatedLogs, waterConsumed);
  };

  const addWater = () => {
    const newWater = waterConsumed + 240;
    setWaterConsumed(newWater);
    saveDailyData(logs, newWater);
  };

  const handleDateChange = (offset) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* CABECERA Y DATOS DEL PACIENTE */}
        <header className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-1/3">
            <h1 className="text-3xl font-black text-emerald-800 flex items-center gap-2">
              <TrendingUp className="w-8 h-8" /> Nutriapp
            </h1>
            <div className="flex items-center gap-2 mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {user ? (
                <span className="flex items-center gap-1 text-emerald-500">
                  <Save size={10} /> Sincronización Activa
                </span>
              ) : (
                <span className="animate-pulse">Cargando base de datos...</span>
              )}
            </div>
          </div>

          <div className="lg:w-2/3 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><User size={10}/> Paciente</label>
              <input type="text" value={userData.nombre} onChange={(e) => { const d = {...userData, nombre: e.target.value}; setUserData(d); saveProfile(d); }} className="font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 text-sm outline-none w-full"/>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Scale size={10}/> Peso (kg)</label>
              <input type="number" value={userData.peso} onChange={(e) => { const d = {...userData, peso: e.target.value}; setUserData(d); saveProfile(d); }} className="font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 text-sm outline-none w-full"/>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Ruler size={10}/> Estatura (cm)</label>
              <input type="number" value={userData.estatura} onChange={(e) => { const d = {...userData, estatura: e.target.value}; setUserData(d); saveProfile(d); }} className="font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 text-sm outline-none w-full"/>
            </div>
            <div className="flex flex-col border-l border-slate-100 pl-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase">IMC: <span className="text-emerald-600 font-black">{bmi}</span></p>
              <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full self-start mt-1">Óptimo</span>
            </div>
          </div>
        </header>

        {/* NAVEGADOR DE FECHA */}
        <div className="flex items-center justify-between bg-white px-6 py-4 rounded-3xl shadow-sm border border-slate-200">
          <button onClick={() => handleDateChange(-1)} className="p-3 hover:bg-slate-100 rounded-2xl transition-all"><ChevronLeft size={24}/></button>
          <div className="flex items-center gap-3 font-black text-slate-700">
            <Calendar className="text-emerald-600" size={20}/>
            <span className="capitalize text-lg">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
          <button onClick={() => handleDateChange(1)} className="p-3 hover:bg-slate-100 rounded-2xl transition-all"><ChevronRight size={24}/></button>
        </div>

        {/* RESUMEN DIARIO Y AGUA */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-9 bg-white rounded-3xl p-6 shadow-md border border-slate-200">
            <h2 className="text-lg font-black text-slate-700 mb-6 flex items-center justify-between">
              Balance Total del Día
              {isSyncing && <span className="text-[10px] text-emerald-500 animate-pulse font-bold tracking-widest">GUARDANDO...</span>}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(dailyTotalTargets).map(([group, target]) => {
                const consumed = dailyConsumed[group] || 0;
                const percent = Math.min((consumed/target)*100, 100);
                const isOver = consumed > target;
                return (
                  <div key={group} className={`p-4 rounded-3xl border transition-all ${consumed >= target ? 'bg-emerald-50 border-emerald-100 shadow-sm' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-[8px] font-black uppercase text-slate-400 mb-2">{group}</p>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-xl font-black ${isOver ? 'text-amber-500' : consumed >= target ? 'text-emerald-600' : 'text-slate-700'}`}>{consumed}</span>
                      <span className="text-[10px] text-slate-400 font-bold">/ {target}</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full mt-3 overflow-hidden">
                      <div className={`h-full transition-all duration-1000 ${isOver ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${percent}%` }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3 bg-blue-600 rounded-3xl p-6 shadow-lg shadow-blue-100 text-white flex flex-col justify-between overflow-hidden relative">
            <Droplet className="absolute -right-4 -bottom-4 w-28 h-28 opacity-20" />
            <div className="relative z-10">
              <h2 className="text-sm font-black flex items-center gap-2 mb-2 uppercase tracking-tighter"><Droplet size={14}/> Agua</h2>
              <div className="text-3xl font-black">{waterConsumed} <span className="text-xs text-blue-200 font-bold opacity-80">/ 2400cc</span></div>
            </div>
            <button onClick={addWater} className="relative z-10 mt-6 bg-white text-blue-600 font-black py-3 rounded-2xl text-xs hover:bg-blue-50 transition-all active:scale-95">Añadir Vaso</button>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* PANEL DE REGISTRO */}
          <aside className="lg:col-span-3">
            <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-200 sticky top-4 space-y-4">
              <h3 className="font-black text-slate-700 text-xs uppercase tracking-widest border-b pb-2">Registrar Comida</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Comida</label>
                  <select value={form.meal} onChange={e => setForm({...form, meal: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl text-xs font-bold py-3 px-3 outline-none">
                    {Object.keys(RATIONS_DISTRIBUTION).map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Grupo</label>
                  <select value={form.group} onChange={e => setForm({...form, group: e.target.value, index: 0})} className="w-full bg-slate-50 border-none rounded-xl text-xs font-bold py-3 px-3 outline-none">
                    {Object.keys(dailyTotalTargets).map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Alimento</label>
                  <select value={form.index} onChange={e => setForm({...form, index: parseInt(e.target.value)})} className="w-full bg-slate-50 border-none rounded-xl text-[10px] font-medium py-3 px-3 outline-none">
                    {INTERCHANGE_LISTS[form.group].map((f, i) => <option key={i} value={i}>{f.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Cant.</label>
                    <input type="number" step="0.5" value={form.qty} onChange={e => setForm({...form, qty: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl text-xs font-bold py-3 px-3 outline-none"/>
                  </div>
                  <button onClick={addFood} className="self-end bg-emerald-600 text-white font-black rounded-xl text-xs py-3 px-6 hover:bg-emerald-700 transition-all shadow-md">Añadir</button>
                </div>
              </div>
            </div>
          </aside>

          {/* CUADRÍCULA DE COMIDAS */}
          <main className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-5">
            {Object.keys(RATIONS_DISTRIBUTION).map(mealKey => (
              <div key={mealKey} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:border-emerald-200 transition-all group">
                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                  <span className="font-black text-slate-600 text-[10px] uppercase tracking-widest flex items-center gap-2">
                    <Clock size={12}/> {mealKey}
                  </span>
                  <Utensils size={14} className="text-slate-300"/>
                </div>
                <div className="p-5 space-y-3 min-h-[120px] flex-1">
                  {logs[mealKey].length === 0 ? (
                    <div className="h-full flex items-center justify-center py-6">
                      <p className="text-[10px] text-slate-300 font-bold italic">Esperando registros...</p>
                    </div>
                  ) : 
                    logs[mealKey].map(item => (
                      <div key={item.id} className="flex items-center justify-between group/item p-2 hover:bg-emerald-50 rounded-2xl transition-all">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-xl bg-white border border-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-black shadow-sm">
                            {item.qty}
                          </span>
                          <div>
                            <p className="text-[12px] font-bold text-slate-700 leading-tight">{item.name}</p>
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">{item.group}</p>
                          </div>
                        </div>
                        <button onClick={() => removeFood(mealKey, item.id)} className="text-slate-200 hover:text-rose-500 transition-colors p-2 opacity-0 group-hover/item:opacity-100"><Trash2 size={14}/></button>
                      </div>
                    ))
                  }
                </div>
                {/* Indicador de cumplimiento local */}
                <div className="px-5 py-3 bg-slate-50/30 flex gap-2 overflow-x-auto no-scrollbar border-t border-slate-100">
                   {Object.entries(RATIONS_DISTRIBUTION[mealKey]).map(([g, target]) => {
                     const c = logs[mealKey].filter(l => l.group === g).reduce((a, b) => a + b.qty, 0);
                     return (
                       <div key={g} className={`text-[8px] font-black px-2 py-1 rounded-lg border whitespace-nowrap ${c >= target ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-white text-slate-400 border-slate-100'}`}>
                         {g.substring(0,3)}: {c}/{target}
                       </div>
                     );
                   })}
                </div>
              </div>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;

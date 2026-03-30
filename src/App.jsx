import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, Upload, TrendingUp, Users, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { processReservationData, exportToExcel } from './utils/excelProcessor';
import { supabase } from './supabase';

const App = () => {
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('milos_theme') || 'light');
  const [importedFiles, setImportedFiles] = useState([]);
  const [availableColumns, setAvailableColumns] = useState([]);
  const [visibleCols, setVisibleCols] = useState(['Reservation', 'Status', 'Object group', 'Purchase total', 'Selling total']);
  const [showSuppliers, setShowSuppliers] = useState(true);
  const [searchTags, setSearchTags] = useState([]);
  const [activeFiles, setActiveFiles] = useState([]);
  const [currentView, setCurrentView] = useState('analytics');
  const [viewMode, setViewMode] = useState('table');

  useEffect(() => {
    fetchData();
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const fetchData = async () => {
    try {
      const { data: dbData, error } = await supabase.from('reservations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (dbData && dbData.length > 0) {
        const formatted = dbData.map(d => ({
          id: d.reservation_id,
          purchasePrice: d.purchase_price,
          sellingPrice: d.selling_price,
          ruc: d.ruc_amount,
          rucPercent: d.ruc_percent,
          suppliersText: d.raw_fields?.['Supplier name'] || '',
          fileList: d.file_name,
          date: d.created_at,
          rawFields: d.raw_fields || {},
          topSuppliers: d.raw_fields?.topSuppliers || [] 
        }));
        setData(formatted);
        const allCols = Object.keys(formatted[0].rawFields);
        setAvailableColumns(allCols);
        setImportedFiles([...new Set(formatted.map(d => d.fileList))]);
        setActiveFiles([...new Set(formatted.map(d => d.fileList))]);
      }
    } catch (err) { console.error(err); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const mode = window.confirm("OK - Pridruži bazi (Append) | Cancel - Novi Import (Clear View)") ? 'append' : 'new';
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);
        const { processedData, columns } = processReservationData(json);
        
        setData(prev => {
            const up = mode === 'new' ? [] : [...prev];
            processedData.forEach(p => { 
                const idx = up.findIndex(d => d.id === p.id); 
                if (idx > -1) up[idx] = p; else up.push(p); 
            });
            return up;
        });
        
        setAvailableColumns(columns);
        setImportedFiles(prev => Array.from(new Set([...(mode === 'new' ? [] : prev), file.name])));
        setActiveFiles(prev => Array.from(new Set([...(mode === 'new' ? [] : prev), file.name])));
        
        const toInsert = processedData.map(item => ({
            reservation_id: parseInt(item.id),
            purchase_price: item.purchasePrice || 0,
            selling_price: item.sellingPrice || 0,
            ruc_amount: item.ruc || 0,
            ruc_percent: item.rucPercent || 0,
            status: item.rawFields?.['Status'] || '',
            object_group: item.rawFields?.['Object group'] || '',
            file_name: file.name,
            raw_fields: { ...item.rawFields, topSuppliers: item.topSuppliers }
        }));
        await supabase.from('reservations').upsert(toInsert, { onConflict: 'reservation_id' });
        setIsProcessing(false);
      } catch (err) { alert(err.message); setIsProcessing(false); }
    };
    reader.readAsBinaryString(file);
  };

  const filteredData = useMemo(() => {
    let fData = data.filter(item => activeFiles.includes(item.fileList));
    const activeTerms = [...searchTags.map(t => t.toLowerCase()), searchTerm.trim().toLowerCase()].filter(Boolean);
    if (activeTerms.length === 0) return fData;
    return fData.filter(item => {
      const blob = [String(item.id), ...Object.values(item.rawFields || {})].join(' ').toLowerCase();
      return activeTerms.every(term => blob.includes(term));
    });
  }, [data, searchTerm, searchTags, activeFiles]);

  const stats = useMemo(() => {
    const t = filteredData.reduce((a, b) => ({ p: a.p + b.purchasePrice, s: a.s + b.sellingPrice, r: a.r + b.ruc }), { p: 0, s: 0, r: 0 });
    return { p: t.p, s: t.s, r: t.r, count: filteredData.length, rucPerc: t.s > 0 ? (t.r / t.s) * 100 : 0 };
  }, [filteredData]);

  const removeTag = (t) => setSearchTags(searchTags.filter(tag => tag !== t));
  const toggleFile = (fn) => setActiveFiles(prev => prev.includes(fn) ? prev.filter(f => f !== fn) : [...prev, fn]);

  return (
    <div className="full-screen-container pearl-theme">
      {/* Header: Fixed Style, Dark Background, White Text */}
      <header style={{ background: '#0f172a', color: 'white', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="logo-box" style={{ background: 'white', padding: '8px', borderRadius: '8px' }}><TrendingUp color="#0f172a" size={20} /></div>
          <div>
            <h1 style={{ color: 'white', fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Prime Analytics Pro</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem', margin: 0 }}>V2.1 - Reporting Engine</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', padding: '3px', borderRadius: '10px' }}>
                <button onClick={() => setCurrentView('analytics')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: currentView === 'analytics' ? 'white' : 'transparent', color: currentView === 'analytics' ? '#0f172a' : 'white', fontWeight: 700, cursor: 'pointer' }}>Analitika</button>
                <button onClick={() => setCurrentView('archive')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: currentView === 'archive' ? 'white' : 'transparent', color: currentView === 'archive' ? '#0f172a' : 'white', fontWeight: 700, cursor: 'pointer' }}>Arhiva</button>
            </div>
            <button className="btn" onClick={() => {
                const nt = theme === 'dark' ? 'light' : 'dark';
                setTheme(nt); localStorage.setItem('milos_theme', nt);
            }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '45px' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button className="btn" style={{ background: '#4f46e5', color: 'white', padding: '8px 20px' }} onClick={() => exportToExcel(filteredData, visibleCols)}><Download size={16} /> Eksport</button>
        </div>
      </header>

      <main className="main-content" style={{ padding: '30px' }}>
        {currentView === 'analytics' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            {/* Minimal Stat Bar */}
            <div style={{ display: 'flex', gap: '20px' }}>
                {[ {l: 'Rezervacije', v: stats.count}, {l: 'Nabavna', v: stats.p.toLocaleString('de-DE') + ' €'}, {l: 'Prodajna', v: stats.s.toLocaleString('de-DE') + ' €'}, {l: 'RUC', v: stats.r.toLocaleString('de-DE') + ' €'}, {l: 'Marža', v: stats.rucPerc.toFixed(1) + '%'}].map(s => (
                    <div key={s.l} className="glass-card" style={{ flex: 1, padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{s.v}</h2>
                        <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{s.l}</p>
                    </div>
                ))}
            </div>

            <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h3 style={{ margin: 0, fontWeight: 900, color: 'var(--text-primary)' }}>Analitički Pregled</h3>
                        <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '4px', borderRadius: '10px' }}>
                            <button onClick={() => setViewMode('table')} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', background: viewMode === 'table' ? 'var(--card-bg)' : 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Tabela (V1)</button>
                            <button onClick={() => setViewMode('card')} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', background: viewMode === 'card' ? 'var(--card-bg)' : 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Kartice (V2)</button>
                        </div>
                    </div>
                    <div className="search-box" style={{ width: '350px', background: 'var(--bg-primary)', border: '1px solid var(--card-border)', padding: '10px 15px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
                        <Search size={16} color="var(--text-secondary)" />
                        <input type="text" placeholder="Traži..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchTerm && (setSearchTags([...searchTags, searchTerm]), setSearchTerm(''))} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', marginLeft: '10px', width: '100%', outline: 'none' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                    {searchTags.map(t => <span key={t} className="tag" style={{ background: 'var(--text-primary)', color: 'var(--bg-secondary)', padding: '6px 12px' }}>{t} <span onClick={() => removeTag(t)} style={{ cursor: 'pointer', marginLeft: '6px' }}>×</span></span>)}
                </div>

                {viewMode === 'table' ? (
                    <div className="table-wrapper">
                        <table className="analysis-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-primary)', borderBottom: '2px solid var(--card-border)' }}>
                                    <th style={{ textAlign: 'left', padding: '12px' }}>ID</th>
                                    <th style={{ textAlign: 'left', padding: '12px' }}>Status</th>
                                    <th style={{ textAlign: 'left', padding: '12px' }}>Objekat</th>
                                    <th style={{ textAlign: 'right', padding: '12px' }}>Nabavna</th>
                                    <th style={{ textAlign: 'right', padding: '12px' }}>Prodajna</th>
                                    <th style={{ textAlign: 'right', padding: '12px' }}>RUC</th>
                                    <th style={{ textAlign: 'center', padding: '12px' }}>%</th>
                                    {showSuppliers && [1, 2, 3, 4, 5].map(i => <th key={i} style={{ padding: '12px', borderLeft: '1px solid var(--card-border)' }}>Dobavljač {i}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                        <td style={{ padding: '12px', fontWeight: 800 }}>#{item.id}</td>
                                        <td style={{ padding: '12px' }}><span className="tag">{item.rawFields['Status']}</span></td>
                                        <td style={{ padding: '12px' }}>{item.rawFields['Object group']}</td>
                                        <td style={{ textAlign: 'right', padding: '12px' }}>{item.purchasePrice.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'right', padding: '12px' }}>{item.sellingPrice.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'right', padding: '12px', fontWeight: 700 }}>{item.ruc.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'center', padding: '12px', color: item.rucPercent < 5 ? '#dc2626' : 'inherit' }}>{item.rucPercent.toFixed(1)}%</td>
                                        {showSuppliers && [0,1,2,3,4].map(idx => (
                                            <td key={idx} style={{ padding: '10px', fontSize: '0.7rem', borderLeft: '1px solid var(--card-border)', verticalAlign: 'top' }}>
                                                {item.topSuppliers[idx] ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>{item.topSuppliers[idx][0]}</div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6 }}><span>N:</span><span>{item.topSuppliers[idx][1].purchase.toFixed(1)}€</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6 }}><span>P:</span><span>{item.topSuppliers[idx][1].selling.toFixed(1)}€</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--card-border)', marginTop: '2px', fontWeight: 700 }}><span>R:</span><span>{item.topSuppliers[idx][1].ruc.toFixed(1)}€</span></div>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {filteredData.map(item => (
                            <div key={item.id} className="glass-card" style={{ padding: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'grid', gridTemplateColumns: '200px 1fr' }}>
                                <div style={{ borderRight: '1px solid var(--card-border)', paddingRight: '20px' }}>
                                    <h4 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent-color)' }}>#{item.id}</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
                                        <span className="tag">{item.rawFields['Status']}</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, width: '100%' }}>{item.rawFields['Object group']}</span>
                                    </div>
                                    <p style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '15px' }}>{item.fileList}</p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px', paddingLeft: '25px' }}>
                                    {[ {l:'NABAVNA', v: item.purchasePrice, f:'purchase'}, {l:'PRODAJNA', v: item.sellingPrice, f:'selling'}, {l:'RUC', v: item.ruc, f:'ruc', p: item.rucPercent}].map(col => (
                                        <div key={col.l}>
                                            <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '5px' }}>{col.l}</p>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
                                                <h5 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0 }}>{col.v.toLocaleString('de-DE')} €</h5>
                                                {col.p !== undefined && <span style={{ fontSize: '0.8rem', fontWeight: 800, color: col.p < 5 ? '#dc2626' : '#16a34a' }}>{col.p.toFixed(1)}%</span>}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '10px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
                                                {item.topSuppliers.map(([n, d], i) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                                        <span style={{ opacity: 0.7, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                                                        <span style={{ fontWeight: 700 }}>{d[col.f].toFixed(1)}€</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Archive Link Placeholder or Button */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div onClick={() => {}} className="glass-card pearl-card" style={{ padding: '30px', cursor: 'pointer', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <Upload size={24} style={{ marginBottom: '10px', color: 'var(--accent-color)' }} />
                    <label style={{ cursor: 'pointer' }}>
                        <h4 style={{ margin: 0 }}>Uvezi nove podatke</h4>
                        <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                </div>
                <div onClick={() => setCurrentView('archive')} className="glass-card pearl-card" style={{ padding: '30px', cursor: 'pointer', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <FileSpreadsheet size={24} style={{ marginBottom: '10px', color: 'var(--accent-color)' }} />
                    <h4 style={{ margin: 0 }}>Pogledaj Arhivu</h4>
                </div>
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
             <h3 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>Arhiva Izveštaja</h3>
             <table className="analysis-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--bg-primary)' }}>
                    <tr><th style={{ padding:'12px', textAlign:'left' }}>Fajl</th><th style={{ padding:'12px', textAlign:'left' }}>Datum</th><th style={{ padding:'12px', textAlign:'right' }}>Br. Rez.</th><th style={{ padding:'12px', textAlign:'right' }}>RUC</th><th style={{ padding:'12px', textAlign:'center' }}>Akcija</th></tr>
                </thead>
                <tbody>
                    {importedFiles.map(fn => {
                        const rd = data.filter(d => d.fileList === fn);
                        const s = rd.reduce((a, b) => ({ r: a.r + b.ruc }), { r: 0 });
                        return (
                            <tr key={fn} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <td style={{ padding:'15px' }}>{fn}</td>
                                <td style={{ padding:'15px' }}>{new Date(rd[0]?.date).toLocaleDateString('de-DE')}</td>
                                <td style={{ padding:'15px', textAlign:'right' }}>{rd.length}</td>
                                <td style={{ padding:'15px', textAlign:'right', fontWeight:800 }}>{s.r.toLocaleString('de-DE')} €</td>
                                <td style={{ padding:'15px', textAlign:'center' }}><button onClick={() => { setActiveFiles([fn]); setCurrentView('analytics'); }} className="btn">Prikaži</button></td>
                            </tr>
                        );
                    })}
                </tbody>
             </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

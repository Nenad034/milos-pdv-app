import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, Upload, TrendingUp, CheckCircle2, FileSpreadsheet, Filter } from 'lucide-react';
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

  const toggleColumn = (col) => setVisibleCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  const removeTag = (t) => setSearchTags(searchTags.filter(tag => tag !== t));
  const toggleFile = (fn) => setActiveFiles(prev => prev.includes(fn) ? prev.filter(f => f !== fn) : [...prev, fn]);

  return (
    <div className="full-screen-container pearl-theme">
      <header style={{ background: '#0f172a', color: 'white', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="logo-box" style={{ background: 'white', padding: '8px', borderRadius: '8px' }}><TrendingUp color="#0f172a" size={20} /></div>
          <div>
            <h1 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>Prime Analytics Pro</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem', margin: 0 }}>V2.1 - Reporting Intelligence</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', padding: '3px', borderRadius: '10px' }}>
             <button onClick={() => setCurrentView('analytics')} style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: currentView === 'analytics' ? 'white' : 'transparent', color: currentView === 'analytics' ? '#0f172a' : 'white', fontWeight: 700, cursor: 'pointer' }}>Analitika</button>
             <button onClick={() => setCurrentView('archive')} style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: currentView === 'archive' ? 'white' : 'transparent', color: currentView === 'archive' ? '#0f172a' : 'white', fontWeight: 700, cursor: 'pointer' }}>Arhiva</button>
          </div>
          <button className="btn" onClick={() => { const nt = theme === 'dark' ? 'light' : 'dark'; setTheme(nt); localStorage.setItem('milos_theme', nt); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '45px' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button className="btn" style={{ background: '#4f46e5', color: 'white', padding: '8px 22px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => exportToExcel(filteredData, visibleCols)}><Download size={16} /> Eksport</button>
        </div>
      </header>

      <main className="main-content" style={{ padding: '30px' }}>
        {currentView === 'analytics' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* Stats Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px' }}>
               {[ { l: 'Rezervacije', v: stats.count }, { l: 'Nabavna', v: stats.p.toLocaleString('de-DE') + ' €' }, { l: 'Prodajna', v: stats.s.toLocaleString('de-DE') + ' €' }, { l: 'RUC', v: stats.r.toLocaleString('de-DE') + ' €' }, { l: 'Marža', v: stats.rucPerc.toFixed(1) + '%' }].map(s => (
                 <div key={s.l} className="glass-card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{s.v}</h2>
                    <p style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>{s.l}</p>
                 </div>
               ))}
            </div>

            {/* Upload Area & Active Files */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '30px' }}>
                <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <h3 style={{ marginBottom: '15px', color: 'var(--text-primary)', fontWeight: 800 }}>Uvoz podataka</h3>
                    <label className="upload-dropzone" style={{ border: '2px dashed var(--card-border)', borderRadius: '15px', padding: '50px', textAlign: 'center', cursor: 'pointer', display: 'block', background: 'var(--bg-primary)' }}>
                        <Upload size={32} color="var(--text-secondary)" style={{ marginBottom: '15px' }} />
                        <p style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700 }}>{isProcessing ? 'Procesiranje...' : 'Kliknite ili prevucite Excel fajl ovde'}</p>
                        <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                </div>
                <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <h3 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 900, textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><Filter size={14} /> Aktivni Fajlovi</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {importedFiles.map(fn => (
                            <div key={fn} onClick={() => toggleFile(fn)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', border: '1px solid', borderColor: activeFiles.includes(fn) ? '#4f46e5' : 'var(--card-border)', background: activeFiles.includes(fn) ? 'rgba(79,70,229,0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                <CheckCircle2 size={14} color={activeFiles.includes(fn) ? '#4f46e5' : '#cbd5e1'} /> {fn}
                            </div>
                        ))}
                        {importedFiles.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>Nema uvezenih fajlova</p>}
                    </div>
                </div>
            </div>

            {/* Analysis Grid */}
            <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h2 style={{ margin: 0, fontWeight: 900, color: 'var(--text-primary)', fontSize: '1.4rem' }}>Analitički Pregled</h2>
                        <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '4px', borderRadius: '10px' }}>
                            <button onClick={() => setViewMode('table')} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: viewMode === 'table' ? 'var(--card-bg)' : 'transparent', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>Tabela (V1)</button>
                            <button onClick={() => setViewMode('card')} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: viewMode === 'card' ? 'var(--card-bg)' : 'transparent', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>Kartice (V2)</button>
                        </div>
                    </div>
                    <div className="search-box" style={{ width: '400px', background: 'var(--bg-primary)', border: '1px solid var(--card-border)', padding: '12px 18px', borderRadius: '14px', display: 'flex', alignItems: 'center' }}>
                        <Search size={18} color="var(--text-secondary)" />
                        <input type="text" placeholder="Pretraži..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchTerm && (setSearchTags([...searchTags, searchTerm]), setSearchTerm(''))} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', marginLeft: '12px', width: '100%', outline: 'none', fontSize: '0.9rem' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '25px' }}>
                   {searchTags.map(t => <span key={t} className="tag" style={{ background: 'var(--text-primary)', color: 'var(--bg-secondary)', padding: '8px 14px', fontWeight: 700 }}>{t} <span onClick={() => removeTag(t)} style={{ cursor: 'pointer', marginLeft: '8px' }}>×</span></span>)}
                </div>

                {viewMode === 'table' ? (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '25px', paddingBottom: '25px', borderBottom: '1px solid var(--card-border)' }}>
                        <p style={{ width: '100%', fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Upravljaj kolonama:</p>
                        {availableColumns.map(col => (
                            <button key={col} onClick={() => toggleColumn(col)} style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--card-border)', background: visibleCols.includes(col) ? 'var(--text-primary)' : 'var(--card-bg)', color: visibleCols.includes(col) ? 'var(--bg-secondary)' : 'var(--text-primary)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700 }}>{col}</button>
                        ))}
                        <button onClick={() => setShowSuppliers(!showSuppliers)} style={{ padding: '8px 16px', borderRadius: '10px', background: showSuppliers ? '#4f46e5' : 'transparent', color: showSuppliers ? 'white' : '#4f46e5', border: '1px solid #4f46e5', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>+ Dobavljački raličnik</button>
                    </div>
                    <div className="table-wrapper">
                        <table className="analysis-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-primary)', borderBottom: '2px solid var(--card-border)' }}>
                                    <th style={{ textAlign: 'left', padding: '16px' }}>ID</th>
                                    {availableColumns.filter(c => visibleCols.includes(c) && c !== 'Reservation').map(c => <th key={c} style={{ textAlign: 'left', padding: '16px' }}>{c}</th>)}
                                    <th style={{ textAlign: 'right', padding: '16px' }}>Nabavna</th>
                                    <th style={{ textAlign: 'right', padding: '16px' }}>Prodajna</th>
                                    <th style={{ textAlign: 'right', padding: '16px' }}>RUC</th>
                                    <th style={{ textAlign: 'center', padding: '16px' }}>%</th>
                                    {showSuppliers && [1,2,3,4,5].map(i => <th key={i} style={{ textAlign: 'left', padding: '16px', borderLeft: '1px solid var(--card-border)' }}>D{i}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                        <td style={{ padding: '16px', fontWeight: 800 }}>#{item.id}</td>
                                        {availableColumns.filter(c => visibleCols.includes(c) && c !== 'Reservation').map(c => <td key={c} style={{ padding: '16px' }}>{item.rawFields[c] || '-'}</td>)}
                                        <td style={{ textAlign: 'right', padding: '16px' }}>{item.purchasePrice.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'right', padding: '16px' }}>{item.sellingPrice.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'right', padding: '16px', fontWeight: 800 }}>{item.ruc.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'center', padding: '16px', color: item.rucPercent < 5 ? '#dc2626' : 'inherit', fontWeight: 800 }}>{item.rucPercent.toFixed(1)}%</td>
                                        {showSuppliers && [0,1,2,3,4].map(idx => (
                                            <td key={idx} style={{ padding: '12px', borderLeft: '1px solid var(--card-border)', fontSize: '0.75rem', verticalAlign: 'top' }}>
                                                {item.topSuppliers[idx] ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <div style={{ fontWeight: 900, marginBottom: '4px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px' }}>{item.topSuppliers[idx][0]}</div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6 }}><span>N:</span><span>{item.topSuppliers[idx][1].purchase.toFixed(1)}€</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6 }}><span>P:</span><span>{item.topSuppliers[idx][1].selling.toFixed(1)}€</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--card-border)', marginTop: '2px', paddingTop: '2px', fontWeight: 800 }}><span>R:</span><span>{item.topSuppliers[idx][1].ruc.toFixed(1)}€</span></div>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                  </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {filteredData.map(item => (
                            <div key={item.id} className="glass-card" style={{ padding: '25px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'grid', gridTemplateColumns: '220px 1fr' }}>
                                <div style={{ borderRight: '1px solid var(--card-border)', paddingRight: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'var(--accent-color)' }}>#{item.id}</h4>
                                        <span className="tag" style={{ fontSize: '0.65rem' }}>{item.rawFields?.['Status']}</span>
                                    </div>
                                    <p style={{ fontWeight: 900, fontSize: '0.9rem', marginBottom: '8px' }}>{item.rawFields?.['Object group']}</p>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{item.fileList}</p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '35px', paddingLeft: '35px' }}>
                                    {[ {l: 'NABAVNA', v: item.purchasePrice, s: item.topSuppliers, f: 'purchase'}, {l: 'PRODAJNA', v: item.sellingPrice, s: item.topSuppliers, f: 'selling'}, {l: 'RUC', v: item.ruc, s: item.topSuppliers, f: 'ruc', p: item.rucPercent}].map(col => (
                                        <div key={col.l}>
                                            <p style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>{col.l}</p>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
                                                <h5 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0 }}>{col.v.toLocaleString('de-DE')} €</h5>
                                                {col.p !== undefined && <span style={{ fontSize: '0.9rem', fontWeight: 900, color: col.p < 5 ? '#dc2626' : '#16a34a' }}>{col.p.toFixed(1)}%</span>}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '12px' }}>
                                                {col.s.map(([n, d], i) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                        <span style={{ opacity: 0.8, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{n}</span>
                                                        <span style={{ fontWeight: 800 }}>{d[col.f].toFixed(1)}€</span>
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
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
             <h2 style={{ marginBottom: '25px', fontWeight: 900, color: 'var(--text-primary)' }}>Arhiva Izveštaja</h2>
             <table className="analysis-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--bg-primary)' }}>
                    <tr><th style={{ padding: '15px', textAlign: 'left' }}>Fajl</th><th style={{ padding: '15px', textAlign: 'left' }}>Datum Arhive</th><th style={{ padding: '15px', textAlign: 'right' }}>Stavke</th><th style={{ padding: '15px', textAlign: 'right' }}>Nabavna</th><th style={{ padding: '15px', textAlign: 'right' }}>Prodajna</th><th style={{ padding: '15px', textAlign: 'right' }}>RUC</th><th style={{ padding: '15px', textAlign: 'center' }}>Akcija</th></tr>
                </thead>
                <tbody>
                    {importedFiles.map(fn => {
                        const rd = data.filter(d => d.fileList === fn);
                        const s = rd.reduce((a, b) => ({ p: a.p + b.purchasePrice, s: a.s + b.sellingPrice, r: a.r + b.ruc }), { p: 0, s: 0, r: 0 });
                        return (
                            <tr key={fn} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <td style={{ padding: '15px', fontWeight: 600 }}>{fn}</td>
                                <td style={{ padding: '15px' }}>{new Date(rd[rd.length-1]?.date).toLocaleDateString('de-DE')}</td>
                                <td style={{ padding: '15px', textAlign: 'right' }}>{rd.length}</td>
                                <td style={{ padding: '15px', textAlign: 'right' }}>{s.p.toLocaleString('de-DE')} €</td>
                                <td style={{ padding: '15px', textAlign: 'right' }}>{s.s.toLocaleString('de-DE')} €</td>
                                <td style={{ padding: '15px', textAlign: 'right', fontWeight: 900, color: '#4f46e5' }}>{s.r.toLocaleString('de-DE')} €</td>
                                <td style={{ padding: '15px', textAlign: 'center' }}><button onClick={() => { setActiveFiles([fn]); setCurrentView('analytics'); }} className="btn" style={{ padding: '8px 18px' }}>Prikaži</button></td>
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

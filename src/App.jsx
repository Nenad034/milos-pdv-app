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
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveDate, setArchiveDate] = useState('');

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

  const toggleColumn = (col) => setVisibleCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  const removeTag = (t) => setSearchTags(searchTags.filter(tag => tag !== t));
  const toggleFile = (fn) => setActiveFiles(prev => prev.includes(fn) ? prev.filter(f => f !== fn) : [...prev, fn]);

  return (
    <div className="full-screen-container pearl-theme">
      {/* Header: Fixed Style, Always Dark, White Text */}
      <header style={{ background: '#0f172a', color: 'white', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="logo-box" style={{ background: 'white', padding: '8px', borderRadius: '8px' }}><TrendingUp color="#0f172a" size={20} /></div>
          <div>
            <h1 style={{ color: 'white', fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Prime Analytics Pro</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem', margin: 0 }}>Reporting Intelligence Engine</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', padding: '3px', borderRadius: '10px' }}>
             <button onClick={() => setCurrentView('analytics')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: currentView === 'analytics' ? 'white' : 'transparent', color: currentView === 'analytics' ? '#0f172a' : 'white', fontWeight: 700, cursor: 'pointer' }}>Analitika</button>
             <button onClick={() => setCurrentView('archive')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: currentView === 'archive' ? 'white' : 'transparent', color: currentView === 'archive' ? '#0f172a' : 'white', fontWeight: 700, cursor: 'pointer' }}>Arhiva</button>
          </div>
          <button className="btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '0 15px' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button className="btn" style={{ background: '#4f46e5', color: 'white', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => exportToExcel(filteredData, visibleCols)}><Download size={16} /> Eksport</button>
        </div>
      </header>

      <main className="main-content" style={{ padding: '30px' }}>
        {currentView === 'analytics' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* Stats Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px' }}>
               {[ { l: 'Rezervacije', v: stats.count }, { l: 'Nabavna', v: stats.p.toLocaleString('de-DE') + ' €' }, { l: 'Prodajna', v: stats.s.toLocaleString('de-DE') + ' €' }, { l: 'RUC', v: stats.r.toLocaleString('de-DE') + ' €' }, { l: 'Marža', v: stats.rucPerc.toFixed(1) + '%' }].map(s => (
                 <div key={s.l} className="glass-card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{s.v}</h2>
                    <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>{s.l}</p>
                 </div>
               ))}
            </div>

            {/* Upload Area */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '30px' }}>
                <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <h3 style={{ marginBottom: '15px', color: 'var(--text-primary)' }}>Uvoz podataka</h3>
                    <label className="upload-dropzone" style={{ border: '2px dashed var(--card-border)', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer', display: 'block' }}>
                        <Upload size={32} color="var(--text-secondary)" style={{ marginBottom: '15px' }} />
                        <p style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{isProcessing ? 'Procesiranje...' : 'Kliknite ili prevucite Excel fajl'}</p>
                        <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                </div>
                <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '15px' }}>Aktivni Fajlovi</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {importedFiles.map(fn => (
                            <div key={fn} onClick={() => toggleFile(fn)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: '1px solid', borderColor: activeFiles.includes(fn) ? '#4f46e5' : 'var(--card-border)', background: activeFiles.includes(fn) ? 'rgba(79,70,229,0.05)' : 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                                <CheckCircle2 size={12} color={activeFiles.includes(fn) ? '#4f46e5' : '#cbd5e1'} /> {fn}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Analysis Grid */}
            <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h3 style={{ margin: 0, fontWeight: 900, color: 'var(--text-primary)' }}>Analitički Pregled</h3>
                        <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '4px', borderRadius: '10px' }}>
                            <button onClick={() => setViewMode('table')} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', background: viewMode === 'table' ? 'var(--card-bg)' : 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Tabela (V1)</button>
                            <button onClick={() => setViewMode('card')} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', background: viewMode === 'card' ? 'var(--card-bg)' : 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Kartice (V2)</button>
                        </div>
                    </div>
                    <div className="search-box" style={{ width: '350px', background: 'var(--bg-primary)', border: '1px solid var(--card-border)', padding: '10px 15px', borderRadius: '12px' }}>
                        <Search size={16} color="var(--text-secondary)" />
                        <input type="text" placeholder="Traži..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setSearchTags([...searchTags, searchTerm]), setSearchTerm(''))} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', marginLeft: '10px', width: '100%' }} />
                    </div>
                </div>

                {/* Filter Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                   {searchTags.map(t => <span key={t} className="tag" style={{ background: 'var(--text-primary)', color: 'var(--bg-secondary)', padding: '6px 12px' }}>{t} <span onClick={() => removeTag(t)} style={{ cursor: 'pointer', marginLeft: '6px' }}>×</span></span>)}
                </div>

                {viewMode === 'table' ? (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--card-border)' }}>
                        <p style={{ width: '100%', fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Biraj kolone:</p>
                        {availableColumns.map(col => (
                            <button key={col} onClick={() => toggleColumn(col)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--card-border)', background: visibleCols.includes(col) ? 'var(--text-primary)' : 'var(--card-bg)', color: visibleCols.includes(col) ? 'var(--bg-secondary)' : 'var(--text-primary)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}>{col}</button>
                        ))}
                        <button onClick={() => setShowSuppliers(!showSuppliers)} style={{ padding: '6px 12px', borderRadius: '8px', background: showSuppliers ? '#4f46e5' : 'transparent', color: showSuppliers ? 'white' : '#4f46e5', border: '1px solid #4f46e5', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}>+ Dobavljači</button>
                    </div>
                    <div className="table-wrapper">
                        <table className="analysis-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-primary)', borderBottom: '2px solid var(--card-border)' }}>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>ID</th>
                                    {availableColumns.filter(c => visibleCols.includes(c) && c !== 'Reservation').map(c => <th key={c} style={{ textAlign: 'left', padding: '15px' }}>{c}</th>)}
                                    <th style={{ textAlign: 'right', padding: '15px' }}>Nabavna</th>
                                    <th style={{ textAlign: 'right', padding: '15px' }}>Prodajna</th>
                                    <th style={{ textAlign: 'right', padding: '15px' }}>RUC</th>
                                    <th style={{ textAlign: 'right', padding: '15px' }}>%</th>
                                    {showSuppliers && [1,2,3,4,5].map(i => <th key={i} style={{ textAlign: 'left', padding: '15px', borderLeft: '1px solid var(--card-border)' }}>D{i}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                        <td style={{ padding: '15px', fontWeight: 800 }}>#{item.id}</td>
                                        {availableColumns.filter(c => visibleCols.includes(c) && c !== 'Reservation').map(c => <td key={c} style={{ padding: '15px' }}>{item.rawFields[c] || '-'}</td>)}
                                        <td style={{ textAlign: 'right', padding: '15px' }}>{item.purchasePrice.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'right', padding: '15px' }}>{item.sellingPrice.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'right', padding: '15px', fontWeight: 800 }}>{item.ruc.toLocaleString('de-DE')} €</td>
                                        <td style={{ textAlign: 'right', padding: '15px', color: item.rucPercent < 5 ? '#dc2626' : 'inherit', fontWeight: 700 }}>{item.rucPercent.toFixed(1)}%</td>
                                        {showSuppliers && [0,1,2,3,4].map(idx => (
                                            <td key={idx} style={{ padding: '12px', borderLeft: '1px solid var(--card-border)', fontSize: '0.75rem', verticalAlign: 'top' }}>
                                                {item.topSuppliers[idx] ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <div style={{ fontWeight: 800, marginBottom: '2px', color: 'var(--text-primary)' }}>{item.topSuppliers[idx][0]}</div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6 }}><span>N:</span><span>{item.topSuppliers[idx][1].purchase.toFixed(1)}€</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6 }}><span>P:</span><span>{item.topSuppliers[idx][1].selling.toFixed(1)}€</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>R:</span><span>{item.topSuppliers[idx][1].ruc.toFixed(1)}€</span></div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {filteredData.map(item => (
                            <div key={item.id} className="glass-card" style={{ padding: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'grid', gridTemplateColumns: '220px 1fr' }}>
                                <div style={{ borderRight: '1px solid var(--card-border)', paddingRight: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                        <h4 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, color: 'var(--accent-color)' }}>#{item.id}</h4>
                                        <span className="tag" style={{ fontSize: '0.6rem' }}>{item.rawFields?.['Status']}</span>
                                    </div>
                                    <p style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '5px' }}>{item.rawFields?.['Object group']}</p>
                                    <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>{item.fileList}</p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '30px', paddingLeft: '30px' }}>
                                    {[ {l: 'NABAVNA', v: item.purchasePrice, s: item.topSuppliers, f: 'purchase'}, {l: 'PRODAJNA', v: item.sellingPrice, s: item.topSuppliers, f: 'selling'}, {l: 'RUC', v: item.ruc, s: item.topSuppliers, f: 'ruc', p: item.rucPercent}].map(col => (
                                        <div key={col.l}>
                                            <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '5px' }}>{col.l}</p>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                                <h5 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0 }}>{col.v.toLocaleString('de-DE')} €</h5>
                                                {col.p !== undefined && <span style={{ fontSize: '0.8rem', fontWeight: 800, color: col.p < 5 ? '#dc2626' : '#16a34a' }}>{col.p.toFixed(1)}%</span>}
                                            </div>
                                            <div style={{ marginTop: '10px', background: 'var(--bg-primary)', padding: '10px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                {col.s.map(([n, d], i) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                                        <span style={{ opacity: 0.7, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
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
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
             <h3 style={{ marginBottom: '20px' }}>Arhiva Izveštaja</h3>
             <table className="analysis-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--bg-primary)' }}>
                    <tr><th>Fajl</th><th>Datum Arhive</th><th>Stavke</th><th>Nabavna</th><th>Prodajna</th><th>RUC</th><th>Akcija</th></tr>
                </thead>
                <tbody>
                    {importedFiles.map(fn => {
                        const rd = data.filter(d => d.fileList === fn);
                        const s = rd.reduce((a, b) => ({ p: a.p + b.purchasePrice, s: a.s + b.sellingPrice, r: a.r + b.ruc }), { p: 0, s: 0, r: 0 });
                        return (
                            <tr key={fn} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <td style={{ padding: '15px' }}>{fn}</td>
                                <td style={{ padding: '15px' }}>{new Date(rd[0]?.date).toLocaleDateString('de-DE')}</td>
                                <td style={{ padding: '15px' }}>{rd.length}</td>
                                <td style={{ padding: '15px' }}>{s.p.toLocaleString('de-DE')} €</td>
                                <td style={{ padding: '15px' }}>{s.s.toLocaleString('de-DE')} €</td>
                                <td style={{ padding: '15px', fontWeight: 800 }}>{s.r.toLocaleString('de-DE')} €</td>
                                <td style={{ padding: '15px' }}><button onClick={() => { setActiveFiles([fn]); setCurrentView('analytics'); }} className="btn">Prikaži</button></td>
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

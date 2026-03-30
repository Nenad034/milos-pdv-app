import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, Upload, TrendingUp, Users, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  }, []);

  const fetchData = async () => {
    try {
      const { data: dbData, error } = await supabase.from('reservations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (dbData) {
        const formatted = dbData.map(d => ({
          id: d.reservation_id,
          purchasePrice: d.purchase_price,
          sellingPrice: d.selling_price,
          ruc: d.ruc_amount,
          rucPercent: d.ruc_percent,
          suppliersText: d.raw_fields?.['Supplier name'] || '',
          fileList: d.file_name,
          date: d.created_at,
          rawFields: d.raw_fields,
          topSuppliers: d.raw_fields?.topSuppliers || [] 
        }));
        setData(formatted);
        if (dbData[0]) setAvailableColumns(Object.keys(dbData[0].raw_fields || {}));
        setImportedFiles([...new Set(dbData.map(d => d.file_name))]);
        setActiveFiles([...new Set(dbData.map(d => d.file_name))]);
      }
    } catch (err) { console.error(err); }
  };

  const syncToSupabase = async (items, fileName) => {
    const toInsert = items.map(item => ({
      reservation_id: parseInt(item.id),
      purchase_price: item.purchasePrice || 0,
      selling_price: item.sellingPrice || 0,
      ruc_amount: item.ruc || 0,
      ruc_percent: item.rucPercent || 0,
      status: item.rawFields?.['Status'] || '',
      object_group: item.rawFields?.['Object group'] || '',
      file_name: fileName,
      raw_fields: { ...item.rawFields, topSuppliers: item.topSuppliers }
    }));
    await supabase.from('reservations').upsert(toInsert, { onConflict: 'reservation_id' });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const mode = window.confirm("OK - Pridruži bazi | Cancel - Samo ovaj fajl") ? 'append' : 'new';
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
            const up = [...prev];
            processedData.forEach(p => { const idx = up.findIndex(d => d.id === p.id); if (idx > -1) up[idx] = p; else up.push(p); });
            return up;
        });
        setAvailableColumns(columns);
        setImportedFiles(prev => Array.from(new Set([...prev, file.name])));
        if (mode === 'new') setActiveFiles([file.name]);
        else setActiveFiles(prev => Array.from(new Set([...prev, file.name])));
        await syncToSupabase(processedData, file.name);
        setIsProcessing(false);
      } catch (err) { alert(err.message); setIsProcessing(false); }
    };
    reader.readAsBinaryString(file);
  };

  const toggleFile = (fn) => setActiveFiles(prev => prev.includes(fn) ? prev.filter(f => f !== fn) : [...prev, fn]);
  const toggleColumn = (col) => setVisibleCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  const toggleTheme = () => {
    const nt = theme === 'dark' ? 'light' : 'dark';
    setTheme(nt); document.documentElement.setAttribute('data-theme', nt);
    localStorage.setItem('milos_theme', nt);
  };
  const clearAllData = async () => {
    if (window.confirm('Obrisati sve?')) {
        await supabase.from('reservations').delete().neq('reservation_id', 0);
        setData([]); setImportedFiles([]); setActiveFiles([]);
    }
  };

  const filteredData = useMemo(() => {
    const fData = data.filter(item => activeFiles.includes(item.fileList));
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      if (!searchTags.includes(searchTerm.trim())) setSearchTags([...searchTags, searchTerm.trim()]);
      setSearchTerm('');
    }
  };

  const removeTag = (t) => setSearchTags(searchTags.filter(tag => tag !== t));

  return (
    <div className="full-screen-container pearl-theme">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo-box" style={{ background: 'white' }}><TrendingUp color="#0f172a" size={18} /></div>
          <div><h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>Prime Analytics Pro</h1>
          <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)' }}>BI Platform - Master Report</p></div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', padding: '4px', borderRadius: '12px' }}>
                <button onClick={() => setCurrentView('analytics')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: currentView === 'analytics' ? 'white' : 'transparent', color: currentView === 'analytics' ? '#0f172a' : 'white', fontWeight: 700 }}>Analitika</button>
                <button onClick={() => setCurrentView('archive')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: currentView === 'archive' ? 'white' : 'transparent', color: currentView === 'archive' ? '#0f172a' : 'white', fontWeight: 700 }}>Arhiva</button>
            </div>
            <button className="btn btn-secondary" onClick={toggleTheme} style={{ color: 'white', background: 'rgba(255,255,255,0.1)' }}>{theme === 'dark' ? '☀️' : '🌑'}</button>
            <button className="btn" style={{ background: 'var(--accent-color)', color: 'white' }} onClick={() => exportToExcel(filteredData, visibleCols)} disabled={data.length === 0}><Download size={14} /> Eksport</button>
        </div>
      </header>

      <main className="main-content">
        {currentView === 'analytics' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <div className="glass-card stat-card"><div><h2 className="stat-val">{stats.count}</h2><p className="stat-label">Rezervacije</p></div></div>
                <div className="glass-card stat-card"><div><h2 className="stat-val">{stats.p.toLocaleString('de-DE')} €</h2><p className="stat-label">Purchase</p></div></div>
                <div className="glass-card stat-card"><div><h2 className="stat-val">{stats.s.toLocaleString('de-DE')} €</h2><p className="stat-label">Selling</p></div></div>
                <div className="glass-card stat-card"><div><h2 className="stat-val">{stats.r.toLocaleString('de-DE')} €</h2><p className="stat-label">RUC</p></div></div>
                <div className="glass-card stat-card" style={{ borderLeft: stats.rucPerc < 5 ? '4px solid #dc2626' : 'none' }}><div><h2 className="stat-val">{stats.rucPerc.toFixed(1)}%</h2><p className="stat-label">Marža</p></div></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '30px' }}>
                <div className="glass-card pearl-card" style={{ padding: '30px' }}>
                    <h3 style={{ marginBottom: '15px' }}>Uvoz podataka</h3>
                    <label className="upload-dropzone" style={{ padding: '30px', border: '1px dashed var(--card-border)', cursor: 'pointer', textAlign: 'center', borderRadius: '12px', display: 'block' }}>
                        <Upload size={24} color="var(--text-primary)" style={{ marginBottom: '10px' }} />
                        <p style={{ color: 'var(--text-primary)' }}>{isProcessing ? 'Procesiranje...' : 'Kliknite za uvoz Excela'}</p>
                        <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isProcessing} />
                    </label>
                </div>
                <div className="glass-card pearl-card" style={{ padding: '30px' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Aktivni fajlovi</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {importedFiles.map(fn => (
                            <div key={fn} onClick={() => toggleFile(fn)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px', background: activeFiles.includes(fn) ? 'rgba(79, 70, 229, 0.05)' : 'var(--card-bg)', border: `1px solid ${activeFiles.includes(fn) ? 'var(--accent-color)' : 'var(--card-border)'}`, cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                                <CheckCircle2 size={12} color={activeFiles.includes(fn) ? 'var(--accent-color)' : '#cbd5e1'} /> {fn}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="glass-card pearl-card" style={{ padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <h3 style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Analitički Pregled</h3>
                        <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '3px', borderRadius: '10px' }}>
                            <button onClick={() => setViewMode('table')} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, background: viewMode === 'table' ? 'var(--card-bg)' : 'transparent', color: 'var(--text-primary)' }}>Tabela (V1)</button>
                            <button onClick={() => setViewMode('card')} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, background: viewMode === 'card' ? 'var(--card-bg)' : 'transparent', color: 'var(--text-primary)' }}>Kartice (V2)</button>
                        </div>
                    </div>
                    <div className="search-box" style={{ width: '300px', background: 'var(--bg-primary)', border: '1px solid var(--card-border)' }}><Search size={16} color="var(--text-secondary)" /><input type="text" placeholder="Pretraži..." style={{ background: 'transparent', color: 'var(--text-primary)' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleKeyDown} /></div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                    {searchTags.map(tag => (
                        <span key={tag} className="tag" style={{ background: 'var(--text-primary)', color: 'var(--bg-secondary)', fontSize: '0.7rem' }}>
                            {tag} <span onClick={() => removeTag(tag)} style={{ cursor: 'pointer', marginLeft: '5px' }}>×</span>
                        </span>
                    ))}
                </div>

                {viewMode === 'table' ? (
                   <>
                   <div style={{ paddingBottom: '15px', borderBottom: '1px solid var(--card-border)', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {availableColumns.map(col => (
                                <button key={col} onClick={() => toggleColumn(col)} className="tag" style={{ background: visibleCols.includes(col) ? 'var(--text-primary)' : 'var(--card-bg)', color: visibleCols.includes(col) ? 'var(--bg-secondary)' : 'var(--text-primary)', border: '1px solid var(--card-border)', cursor: 'pointer', fontSize: '0.65rem' }}>{col}</button>
                            ))}
                            <button onClick={() => setShowSuppliers(!showSuppliers)} className="tag" style={{ background: showSuppliers ? 'var(--accent-color)' : 'var(--card-bg)', color: showSuppliers ? 'white' : 'var(--accent-color)', border: '1px solid var(--accent-color)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700 }}>+ Dobavljači</button>
                        </div>
                   </div>
                   <div className="table-wrapper">
                      <table className="analysis-table">
                         <thead><tr style={{ borderBottom: '1px solid var(--card-border)' }}><th style={{ color: 'var(--text-secondary)' }}>ID</th>{availableColumns.filter(c => visibleCols.includes(c) && c !== 'Reservation').map(c => <th key={c} style={{ color: 'var(--text-secondary)' }}>{c}</th>)}<th style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>Nabavna</th><th style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>Prodajna</th><th style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>RUC</th><th style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>%</th>{showSuppliers && [1,2,3,4,5].map(i => <th key={i} style={{ color: 'var(--text-secondary)' }}>Dobavljač {i}</th>)}</tr></thead>
                         <tbody>
                            {filteredData.map(item => (
                                <tr key={item.id} className="pearl-row" style={{ borderBottom: '1px solid var(--card-border)' }}>
                                    <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>#{item.id}</td>
                                    {availableColumns.filter(c => visibleCols.includes(c) && c !== 'Reservation').map(c => <td key={c} style={{ color: 'var(--text-primary)' }}>{item.rawFields[c] || '-'}</td>)}
                                    <td style={{ textAlign: 'right', color: 'var(--text-primary)' }}>{item.purchasePrice.toLocaleString('de-DE')} €</td>
                                    <td style={{ textAlign: 'right', color: 'var(--text-primary)' }}>{item.sellingPrice.toLocaleString('de-DE')} €</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{item.ruc.toLocaleString('de-DE')} €</td>
                                    <td style={{ textAlign: 'right', color: item.rucPercent < 5 ? '#dc2626' : 'var(--text-primary)' }}>{item.rucPercent.toFixed(1)}%</td>
                                    {showSuppliers && [0,1,2,3,4].map(idx => (
                                        <td key={idx} style={{ fontSize: '0.6rem', borderLeft: '1px solid var(--card-border)', verticalAlign: 'top', paddingTop: '10px', minWidth: '95px' }}>
                                            {item.topSuppliers[idx] ? (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <div style={{ fontWeight: 800, marginBottom: '2px', color: 'var(--text-primary)' }}>{item.topSuppliers[idx][0]}</div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6, color: 'var(--text-primary)' }}><span>N:</span><span>{item.topSuppliers[idx][1].purchase.toFixed(1)}€</span></div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6, color: 'var(--text-primary)' }}><span>P:</span><span>{item.topSuppliers[idx][1].selling.toFixed(1)}€</span></div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>R:</span><span style={{ fontWeight: 700, color: (item.topSuppliers[idx][1].ruc / (item.topSuppliers[idx][1].selling || 1)) < 0.05 ? '#dc2626' : '#16a34a' }}>{item.topSuppliers[idx][1].ruc.toFixed(1)}€</span></div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredData.map(item => (
                            <div key={item.id} className="glass-card" style={{ padding: '24px', border: '1px solid var(--card-border)', background: 'var(--card-bg)', display: 'grid', gridTemplateColumns: '250px 1fr', gap: '40px', alignItems: 'start' }}>
                                {/* Left Section: Metadata */}
                                <div style={{ borderRight: '1px solid var(--card-border)', paddingRight: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent-color)' }}>#{item.id}</span>
                                        <span className="tag" style={{ fontSize: '0.6rem', padding: '2px 8px' }}>{item.rawFields?.['Status']}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>{item.rawFields?.['Object group']}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>{item.fileList}</div>
                                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.55rem', padding: '4px 8px', background: 'var(--bg-primary)', borderRadius: '6px', color: 'var(--text-secondary)' }}>{new Date(item.date).toLocaleDateString('de-DE')}</span>
                                    </div>
                                </div>

                                {/* Right Section: Financials Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '30px' }}>
                                    {/* Nabavna Column */}
                                    <div>
                                        <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.05em' }}>NABAVNA</p>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '12px' }}>{item.purchasePrice.toLocaleString('de-DE')} <span style={{ fontSize: '0.8rem' }}>€</span></div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--card-sub-bg)', padding: '12px', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                                            {item.topSuppliers.map(([n, d], i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', gap: '10px' }}>
                                                    <span style={{ color: 'var(--text-primary)', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
                                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{d.purchase.toFixed(1)}€</span>
                                                </div>
                                            ))}
                                            {item.topSuppliers.length === 0 && <span style={{ fontSize: '0.65rem', opacity: 0.3 }}>Nema podataka</span>}
                                        </div>
                                    </div>

                                    {/* Prodajna Column */}
                                    <div>
                                        <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.05em' }}>PRODAJNA</p>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '12px' }}>{item.sellingPrice.toLocaleString('de-DE')} <span style={{ fontSize: '0.8rem' }}>€</span></div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--card-sub-bg)', padding: '12px', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                                            {item.topSuppliers.map(([n, d], i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', gap: '10px' }}>
                                                    <span style={{ color: 'var(--text-primary)', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
                                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{d.selling.toFixed(1)}€</span>
                                                </div>
                                            ))}
                                            {item.topSuppliers.length === 0 && <span style={{ fontSize: '0.65rem', opacity: 0.3 }}>Nema podataka</span>}
                                        </div>
                                    </div>

                                    {/* RUC Column */}
                                    <div>
                                        <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.05em' }}>RUC & MARŽA</p>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#16a34a' }}>{item.ruc.toLocaleString('de-DE')} <span style={{ fontSize: '0.8rem' }}>€</span></div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: item.rucPercent < 5 ? '#dc2626' : '#16a34a' }}>{item.rucPercent.toFixed(1)}%</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(22, 163, 74, 0.05)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(22, 163, 74, 0.1)' }}>
                                            {item.topSuppliers.map(([n, d], i) => {
                                                const m = (d.ruc / (d.selling || 1)) * 100;
                                                return (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', gap: '10px' }}>
                                                        <span style={{ color: 'var(--text-primary)', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
                                                        <span style={{ fontWeight: 800, color: m < 5 ? '#dc2626' : '#16a34a' }}>{d.ruc.toFixed(1)}€ ({m.toFixed(0)}%)</span>
                                                    </div>
                                                );
                                            })}
                                            {item.topSuppliers.length === 0 && <span style={{ fontSize: '0.65rem', opacity: 0.3 }}>Nema podataka</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </div>
        ) : (
          <div className="glass-card pearl-card" style={{ padding: '30px', background: 'var(--card-bg)', color: 'var(--text-primary)' }}>
             <h3 style={{ marginBottom: '20px' }}>Arhiva Izveštaja</h3>
             <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input type="text" placeholder="Traži fajl..." value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} style={{ flex: 1, textAlign: 'left', background: 'var(--bg-primary)', border: '1px solid var(--card-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '8px' }} />
                <input type="date" value={archiveDate} onChange={(e) => setArchiveDate(e.target.value)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '8px' }} />
             </div>
             <table className="analysis-table">
                <thead><tr><th style={{ color: 'var(--text-secondary)' }}>Fajl</th><th style={{ color: 'var(--text-secondary)' }}>Datum</th><th style={{ color: 'var(--text-secondary)' }}>Rezervacije</th><th style={{ color: 'var(--text-secondary)' }}>Nabavna</th><th style={{ color: 'var(--text-secondary)' }}>Prodajna</th><th style={{ color: 'var(--text-secondary)' }}>RUC</th><th style={{ color: 'var(--text-secondary)' }}>Akcija</th></tr></thead>
                <tbody>
                    {importedFiles.filter(fn => fn.toLowerCase().includes(archiveSearch.toLowerCase())).map(fn => {
                        const rd = data.filter(d => d.fileList === fn);
                        const s = rd.reduce((a, b) => ({ p: a.p + b.purchasePrice, s: a.s + b.sellingPrice, r: a.r + b.ruc }), { p: 0, s: 0, r: 0 });
                        return (
                            <tr key={fn} className="pearl-row" style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <td style={{ color: 'var(--text-primary)' }}>{fn}</td><td style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>{new Date(rd[0]?.date).toLocaleDateString('de-DE')}</td><td style={{ color: 'var(--text-primary)' }}>{rd.length}</td><td style={{ color: 'var(--text-primary)' }}>{s.p.toLocaleString('de-DE')} €</td><td style={{ color: 'var(--text-primary)' }}>{s.s.toLocaleString('de-DE')} €</td><td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{s.r.toLocaleString('de-DE')} €</td><td><button onClick={() => { setActiveFiles([fn]); setCurrentView('analytics'); }} className="btn">Prikaži</button></td>
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

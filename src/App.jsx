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
  const [currentView, setCurrentView] = useState('analytics'); // 'analytics' | 'archive'
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveDate, setArchiveDate] = useState('');

  useEffect(() => {
    fetchData();
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  const fetchData = async () => {
    try {
      const { data: dbData, error } = await supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false });

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
          rawFields: d.raw_fields,
          topSuppliers: d.raw_fields?.topSuppliers || [] 
        }));

        setData(formatted);
        setAvailableColumns(Object.keys(dbData[0].raw_fields || {}));
        const files = [...new Set(dbData.map(d => d.file_name))];
        setImportedFiles(files);
        setActiveFiles(files); 
      }
    } catch (err) {
      console.warn("DB Fetch Info:", err.message);
    }
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
      raw_fields: {
        ...item.rawFields,
        topSuppliers: item.topSuppliers
      }
    }));

    const { error } = await supabase.from('reservations').upsert(toInsert, { onConflict: 'reservation_id' });
    if (error) console.error("Cloud Sync Error:", error.message);
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
        
        const newData = [...data];
        processedData.forEach(p => {
          const idx = newData.findIndex(d => d.id === p.id);
          if (idx > -1) newData[idx] = p;
          else newData.push(p);
        });

        setData(newData);
        if (columns.length > 0) setAvailableColumns(columns);
        const newFilesList = Array.from(new Set([...importedFiles, file.name]));
        setImportedFiles(newFilesList);
        if (mode === 'new') setActiveFiles([file.name]);
        else setActiveFiles(prev => [...new Set([...prev, file.name])]);
        
        await syncToSupabase(processedData, file.name);
        setIsProcessing(false);
      } catch (err) {
        alert("Greška: " + err.message);
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const toggleFile = (fileName) => {
    setActiveFiles(prev => prev.includes(fileName) ? prev.filter(f => f !== fileName) : [...prev, fileName]);
  };

  const toggleColumn = (colName) => {
    setVisibleCols(prev => prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('milos_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const clearAllData = async () => {
    if (window.confirm('Obrisati sve?')) {
        await supabase.from('reservations').delete().neq('reservation_id', 0); 
        setData([]); setImportedFiles([]); setActiveFiles([]);
    }
  };

  const filteredData = useMemo(() => {
    const fileFiltered = data.filter(item => activeFiles.includes(item.fileList));
    const rawSearch = searchTerm.trim().toLowerCase();
    const activeTerms = [...searchTags.map(t => t.toLowerCase())];
    if (rawSearch) activeTerms.push(rawSearch);
    if (activeTerms.length === 0) return fileFiltered;
    return fileFiltered.filter(item => {
      const fieldValues = [String(item.id), ...Object.values(item.rawFields || {})].map(v => String(v).toLowerCase());
      return activeTerms.every(term => fieldValues.join(' ').includes(term));
    });
  }, [data, searchTerm, searchTags, activeFiles]);

  const stats = useMemo(() => {
    const totals = { purchase: 0, selling: 0, ruc: 0, count: filteredData.length };
    filteredData.forEach(d => { totals.purchase += d.purchasePrice; totals.selling += d.sellingPrice; totals.ruc += d.ruc; });
    return { ...totals, rucPercent: totals.selling > 0 ? (totals.ruc / totals.selling) * 100 : 0 };
  }, [filteredData]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      if (!searchTags.includes(searchTerm.trim())) setSearchTags([...searchTags, searchTerm.trim()]);
      setSearchTerm('');
    }
  };

  const removeTag = (tag) => setSearchTags(searchTags.filter(t => t !== tag));

  return (
    <div className="full-screen-container pearl-theme">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo-box" style={{ background: 'white' }}><TrendingUp color="#0f172a" size={18} /></div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>Prime Analytics <span style={{ color: 'var(--accent-color)' }}>Pro</span></h1>
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)' }}>BI Platform - Master Report</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
             <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.1)', padding: '4px', borderRadius: '12px', marginRight: '20px' }}>
                <button onClick={() => setCurrentView('analytics')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', background: currentView === 'analytics' ? 'white' : 'transparent', color: currentView === 'analytics' ? '#0f172a' : 'white' }}>Analitika</button>
                <button onClick={() => setCurrentView('archive')} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', background: currentView === 'archive' ? 'white' : 'transparent', color: currentView === 'archive' ? '#0f172a' : 'white' }}>Arhiva Izveštaja</button>
             </div>
             <button className="btn btn-secondary" onClick={toggleTheme} style={{ color: 'white', background: 'rgba(255,255,255,0.1)', border: 'none' }}>{theme === 'dark' ? '☀️' : '🌑'}</button>
             <button className="btn" style={{ background: 'var(--accent-color)', color: 'white' }} onClick={() => exportToExcel(filteredData, visibleCols)} disabled={data.length === 0}><Download size={14} /> Eksport</button>
        </div>
      </header>

      <main className="main-content">
        {currentView === 'analytics' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                <div className="glass-card stat-card">
                    <div className="stat-icon"><FileSpreadsheet size={20} /></div>
                    <div><h2 className="stat-val">{stats.count}</h2><p className="stat-label">Rezervacije</p></div>
                </div>
                <div className="glass-card stat-card"><div className="stat-icon" style={{ color: '#dc2626' }}><TrendingUp size={20} /></div><div><h2 className="stat-val">{stats.purchase.toLocaleString('de-DE')} €</h2><p className="stat-label">Purchase</p></div></div>
                <div className="glass-card stat-card"><div className="stat-icon" style={{ color: '#16a34a' }}><TrendingUp size={20} /></div><div><h2 className="stat-val">{stats.selling.toLocaleString('de-DE')} €</h2><p className="stat-label">Selling</p></div></div>
                <div className="glass-card stat-card"><div className="stat-icon"><Users size={20} /></div><div><h2 className="stat-val">{stats.ruc.toLocaleString('de-DE')} €</h2><p className="stat-label">Ukupan RUC</p></div></div>
                <div className="glass-card stat-card" style={{ borderLeft: stats.rucPercent < 5 ? '4px solid #dc2626' : 'none' }}><div><h2 className="stat-val">{stats.rucPercent.toFixed(1)}%</h2><p className="stat-label">Marža (%)</p></div></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px' }}>
              <div className="glass-card pearl-card" style={{ padding: '30px' }}>
                <h3 style={{ marginBottom: '20px' }}>Uvezite fajl</h3>
                <label htmlFor="file-upload" className="upload-dropzone" style={{ padding: '40px', border: '1px dashed #cbd5e1', cursor: 'pointer' }}>
                  <Upload size={30} color="#0f172a" />
                  <p style={{ marginTop: '10px' }}>{isProcessing ? 'Učitavanje...' : 'Kliknite za uvoz Excel datoteke'}</p>
                  <input id="file-upload" type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isProcessing}/>
                </label>
              </div>
              <div className="glass-card pearl-card" style={{ padding: '30px' }}>
                  <h4 style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '15px' }}>Aktivni fajlovi</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {importedFiles.map((fn, idx) => (
                          <div key={idx} onClick={() => toggleFile(fn)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: `1px solid ${activeFiles.includes(fn) ? 'var(--accent-color)' : '#e2e8f0'}`, background: activeFiles.includes(fn) ? 'rgba(79, 70, 229, 0.05)' : 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                              <CheckCircle2 size={14} color={activeFiles.includes(fn) ? 'var(--accent-color)' : '#cbd5e1'} />
                              <span style={{ fontWeight: 600 }}>{fn}</span>
                          </div>
                      ))}
                  </div>
              </div>
            </div>

            <div className="glass-card pearl-card" style={{ padding: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Analitički Izveštaj</h3>
                  <div className="search-box" style={{ width: '350px' }}><Search size={16} className="search-icon" /><input type="text" placeholder="Pretraži..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleKeyDown} /></div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                  {searchTags.map(tag => (<span key={tag} className="tag" style={{ background: '#0f172a', color: 'white' }}>{tag} <span onClick={() => removeTag(tag)} style={{ cursor: 'pointer', marginLeft: '5px' }}>×</span></span>))}
              </div>
              <div style={{ paddingBottom: '20px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {availableColumns.map(col => (<button key={col} onClick={() => toggleColumn(col)} className="tag" style={{ background: visibleCols.includes(col) ? '#0f172a' : 'white', color: visibleCols.includes(col) ? 'white' : '#0f172a', border: '1px solid #e2e8f0' }}>{col}</button>))}
                      <button onClick={() => setShowSuppliers(!showSuppliers)} className="tag" style={{ background: showSuppliers ? '#4f46e5' : 'white', color: showSuppliers ? 'white' : '#4f46e5', border: '1px solid #4f46e5' }}>Dobavljači (T5)</button>
                  </div>
              </div>
              <div className="table-wrapper">
                  <table className="analysis-table">
                  <thead>
                      <tr>
                          <th>ID Rez.</th>
                          {availableColumns.filter(c => visibleCols.includes(c) && c !== 'Reservation').map(col => (<th key={col}>{col}</th>))}
                          <th style={{ textAlign: 'right' }}>Nabavna</th>
                          <th style={{ textAlign: 'right' }}>Prodajna</th>
                          <th style={{ textAlign: 'right' }}>RUC</th>
                          <th style={{ textAlign: 'right' }}>%</th>
                          {showSuppliers && [1,2,3,4,5].map(i => <th key={i}>Dobavljač {i}</th>)}
                      </tr>
                  </thead>
                  <tbody>
                      {filteredData.map((item) => (
                          <tr key={item.id} className="pearl-row">
                              <td style={{ fontWeight: 800 }}>#{item.id}</td>
                              {availableColumns.filter(c => visibleCols.includes(c) && c !== 'Reservation').map(col => (<td key={col}>{item.rawFields[col] || '-'}</td>))}
                              <td style={{ textAlign: 'right' }}>{item.purchasePrice.toLocaleString('de-DE')} €</td>
                              <td style={{ textAlign: 'right' }}>{item.sellingPrice.toLocaleString('de-DE')} €</td>
                              <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.ruc.toLocaleString('de-DE')} €</td>
                              <td style={{ textAlign: 'right', color: item.rucPercent < 5 ? '#dc2626' : 'inherit' }}>{item.rucPercent.toFixed(1)}%</td>
                              {showSuppliers && [0,1,2,3,4].map(idx => (
                                  <td key={idx} style={{ fontSize: '0.65rem', borderLeft: '1px solid #f1f5f9', minWidth: '90px' }}>
                                      {item.topSuppliers?.[idx] ? (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '2px' }}>{item.topSuppliers[idx][0]}</div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}><span>N:</span> <span>{item.topSuppliers[idx][1].purchase.toFixed(1)}€</span></div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}><span>P:</span> <span>{item.topSuppliers[idx][1].selling.toFixed(1)}€</span></div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>R:</span> <span style={{ fontWeight: 800, color: (item.topSuppliers[idx][1].ruc / (item.topSuppliers[idx][1].selling || 1)) < 0.05 ? '#dc2626' : '#16a34a' }}>{item.topSuppliers[idx][1].ruc.toFixed(1)}€</span></div>
                                          </div>
                                      ) : '-'}
                                  </td>
                              ))}
                          </tr>
                      ))}
                  </tbody>
                  </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card pearl-card" style={{ padding: '30px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                 <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>Arhiva Izveštaja</h3>
                 <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <div className="search-box" style={{ width: '250px' }}><Search size={14} className="search-icon" /><input type="text" placeholder="Naziv..." value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} /></div>
                    <input type="date" className="btn-calendar" style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', color: '#0f172a', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }} value={archiveDate} onChange={(e) => setArchiveDate(e.target.value)} />
                 </div>
             </div>
             <div className="table-wrapper">
                <table className="analysis-table">
                    <thead>
                        <tr>
                            <th>Naziv Izveštaja</th>
                            <th style={{ textAlign: 'center' }}>Datum Uvoza</th>
                            <th style={{ textAlign: 'right' }}>Rezervacije</th>
                            <th style={{ textAlign: 'right' }}>Ukupna Nabavna</th>
                            <th style={{ textAlign: 'right' }}>Ukupna Prodajna</th>
                            <th style={{ textAlign: 'right' }}>Ukupan RUC</th>
                            <th style={{ textAlign: 'center' }}>Akcija</th>
                        </tr>
                    </thead>
                    <tbody>
                        {importedFiles.filter(fn => {
                            const rd = data.filter(d => d.fileList === fn);
                            const nm = fn.toLowerCase().includes(archiveSearch.toLowerCase());
                            const dm = archiveDate ? rd[0]?.date?.includes(archiveDate) : true;
                            return nm && dm;
                        }).map(fn => {
                            const rd = data.filter(d => d.fileList === fn);
                            const rDate = rd[0]?.date ? new Date(rd[0].date).toLocaleDateString('de-DE') : '-';
                            const stats = rd.reduce((a, b) => ({ p: a.p + b.purchasePrice, s: a.s + b.sellingPrice, r: a.r + b.ruc }), { p: 0, s: 0, r: 0 });
                            return (
                                <tr key={fn} className="pearl-row">
                                    <td style={{ fontWeight: 700 }}>{fn}</td>
                                    <td style={{ textAlign: 'center' }}><span className="tag" style={{ background: 'rgba(79, 70, 229, 0.05)', color: 'var(--accent-color)' }}>{rDate}</span></td>
                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{rd.length}</td>
                                    <td style={{ textAlign: 'right' }}>{stats.p.toLocaleString('de-DE')} €</td>
                                    <td style={{ textAlign: 'right' }}>{stats.s.toLocaleString('de-DE')} €</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{stats.r.toLocaleString('de-DE')} €</td>
                                    <td style={{ textAlign: 'center' }}><button onClick={() => { setActiveFiles([fn]); setCurrentView('analytics'); }} className="btn" style={{ fontSize: '0.7rem', padding: '8px 16px', background: 'var(--accent-color)' }}>Prikaži</button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

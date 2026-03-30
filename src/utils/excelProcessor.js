import * as XLSX from 'xlsx';

/**
 * Processes raw Excel data and merges it into existing reservations if provided.
 */
export const processReservationData = (rawData, existingReservationsMap = {}, fileName = 'Nepoznat', existingColumns = []) => {
  const map = { ...existingReservationsMap };
  const allColumns = new Set(existingColumns);
  
  // Basic columns we always want to track
  const baseCols = ['Reservation', 'Purchase total', 'Selling total', 'Supplier name', 'Ruc'];
  baseCols.forEach(c => allColumns.add(c));

  rawData.forEach((row) => {
    const resId = row['Reservation'];
    const supplier = row['Supplier name'] || 'Nepoznat';
    const purchase = parseFloat(row['Purchase total']) || 0;
    const selling = parseFloat(row['Selling total']) || 0;
    const ruc = selling - purchase;

    if (!resId) return;

    // Capture all columns from this row
    Object.keys(row).forEach(key => allColumns.add(key));

    if (!map[resId]) {
      map[resId] = {
        id: resId,
        suppliersList: new Set(),
        purchasePrice: 0,
        sellingPrice: 0,
        ruc: 0,
        supplierBreakdown: {}, // { supplierName: { purchase, selling, ruc } }
        rawFields: { ...row }, // Store first row's data for all other columns
        files: new Set()
      };
    }

    const res = map[resId];
    res.files.add(fileName);
    res.suppliersList.add(supplier);
    res.purchasePrice += purchase;
    res.sellingPrice += selling;
    res.ruc += ruc;

    if (!res.supplierBreakdown[supplier]) {
      res.supplierBreakdown[supplier] = { purchase: 0, selling: 0, ruc: 0 };
    }
    const sData = res.supplierBreakdown[supplier];
    sData.purchase += purchase;
    sData.selling += selling;
    sData.ruc += ruc;
  });

  const processedData = Object.values(map).map((res) => {
    const sortedSuppliers = Object.entries(res.supplierBreakdown)
      .sort((a, b) => b[1].ruc - a[1].ruc);

    const rucPercent = res.sellingPrice > 0 ? (res.ruc / res.sellingPrice) * 100 : 0;

    return {
      ...res,
      rucPercent,
      topSuppliers: sortedSuppliers.slice(0, 5),
      suppliersText: Array.from(res.suppliersList).join(', '),
      fileList: Array.from(res.files).join(', ')
    };
  });

  return { 
    processedData, 
    updatedMap: map, 
    columns: Array.from(allColumns)
  };
};

/**
 * Saves processed data to localStorage.
 */
export const saveToStorage = ({ processedData, resMap, visibleExcelCols, importedFiles }) => {
  try {
    // Convert Sets to Arrays for JSON storage
    const storageResMap = {};
    Object.entries(resMap).forEach(([id, res]) => {
      storageResMap[id] = {
        ...res,
        suppliersList: Array.from(res.suppliersList || []),
        files: Array.from(res.files || [])
      };
    });

    const dataToSave = { 
        processedData, 
        resMap: storageResMap, 
        visibleExcelCols, 
        importedFiles 
    };
    
    localStorage.setItem('milos_pdv_data', JSON.stringify(dataToSave));
    localStorage.setItem('milos_pdv_last_update', new Date().toISOString());
  } catch (e) {
    console.error('Failed to save data:', e);
  }
};

/**
 * Loads data from localStorage and hydrates Sets.
 */
export const loadFromStorage = () => {
  try {
    const data = localStorage.getItem('milos_pdv_data');
    if (!data) return null;
    const parsed = JSON.parse(data);
    
    // Hydrate Sets in resMap
    if (parsed.resMap) {
        Object.values(parsed.resMap).forEach(res => {
          res.suppliersList = new Set(res.suppliersList || []);
          res.files = new Set(res.files || []);
        });
    }
    
    return parsed;
  } catch (e) {
    return null;
  }
};

/**
 * Exports processed data back to Excel.
 * Now dynamically includes all raw fields that might have been stored.
 */
export const exportToExcel = (data, visibleExcelCols = []) => {
  const rows = data.map(item => {
    const row = {
      'Reservation': item.id,
    };

    // Add user selected excel columns
    visibleExcelCols.forEach(col => {
        if (col !== 'Reservation') {
            row[col] = item.rawFields[col] || '-';
        }
    });

    row['Purchase Price'] = item.purchasePrice.toFixed(2);
    row['Selling Price'] = item.sellingPrice.toFixed(2);
    row['Ruc'] = item.ruc.toFixed(2);
    row['Ruc %'] = (item.rucPercent || 0).toFixed(2) + '%';

    // Add 5 supplier columns with detailed P/S/R
    for (let i = 0; i < 5; i++) {
        const suppEntry = item.topSuppliers[i];
        if (suppEntry) {
            const [name, sData] = suppEntry;
            row[`Dobavljač ${i + 1}`] = `${name} (P:${sData.purchase.toFixed(2)}, S:${sData.selling.toFixed(2)}, R:${sData.ruc.toFixed(2)})`;
        } else {
            row[`Dobavljač ${i + 1}`] = '-';
        }
    }

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Izvestaj_PDV');
  XLSX.writeFile(workbook, `Izvestaj_RUC_${new Date().toLocaleDateString()}.xlsx`);
};

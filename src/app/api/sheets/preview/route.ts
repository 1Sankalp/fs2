import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get sheet URL from request
    const { sheetUrl } = await request.json();
    if (!sheetUrl) {
      return NextResponse.json({ message: 'Sheet URL is required' }, { status: 400 });
    }

    // Extract the sheet ID from the URL
    const sheetIdMatch = sheetUrl.match(/\/d\/([^/]+)/);
    if (!sheetIdMatch || !sheetIdMatch[1]) {
      return NextResponse.json({ message: 'Invalid Google Sheet URL' }, { status: 400 });
    }
    const sheetId = sheetIdMatch[1];

    // Get the CSV export URL
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

    // Fetch the CSV data
    const response = await axios.get(csvUrl, { timeout: 10000 });
    const csvData = response.data;

    // Parse the CSV data
    const parseCSV = (csv: string) => {
      const lines = csv.split('\n');
      if (lines.length === 0) {
        return { headers: [], rows: [] };
      }

      // Parse headers (first row)
      const headers = parseCSVRow(lines[0]);
      
      // Parse data rows (skip header)
      const rows = lines.slice(1).map(line => {
        if (line.trim() === '') return {};
        const rowValues = parseCSVRow(line);
        
        // Create an object mapping headers to values
        return headers.reduce((obj, header, i) => {
          obj[header] = rowValues[i] || '';
          return obj;
        }, {} as Record<string, string>);
      }).filter(row => Object.keys(row).length > 0);
      
      return { headers, rows };
    };

    // Helper to parse a CSV row, handling quoted fields
    const parseCSVRow = (row: string) => {
      const fields = [];
      let inQuotes = false;
      let currentField = '';
      
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        
        if (char === '"' && (i === 0 || row[i-1] !== '\\')) {
          inQuotes = !inQuotes;
          continue;
        }
        
        if (char === ',' && !inQuotes) {
          fields.push(currentField.trim());
          currentField = '';
          continue;
        }
        
        currentField += char;
      }
      
      // Add the last field
      fields.push(currentField.trim());
      
      return fields.map(field => {
        // Remove surrounding quotes
        if (field.startsWith('"') && field.endsWith('"')) {
          return field.substring(1, field.length - 1);
        }
        return field;
      });
    };

    const { headers, rows } = parseCSV(csvData);

    // Prepare preview data
    // Get all unique website URLs (max 10 for preview)
    const allUrls: string[] = [];
    headers.forEach(header => {
      const columnUrls = rows
        .map(row => row[header])
        .filter(url => url && url.trim() !== '' && (
          url.startsWith('http') || url.startsWith('www.')
        ))
        .slice(0, 10);
      
      allUrls.push(...columnUrls);
    });

    // Return column names and preview data
    return NextResponse.json({
      columns: headers,
      preview: allUrls.slice(0, 10),
    });
  } catch (error) {
    console.error('Sheet preview error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch Google Sheet data' },
      { status: 500 }
    );
  }
} 
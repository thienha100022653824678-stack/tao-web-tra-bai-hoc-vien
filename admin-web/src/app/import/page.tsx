'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Upload, FileText, CheckCircle2, 
  AlertCircle, AlertTriangle, Play, Download, Search, Check, Copy
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './import.module.css';

interface ExcelRow {
  original_channel_name?: string;
  normalized_title?: string;
  telegram_chat_id?: string | number;
  recipe?: string;
  match_status?: string;
  notes?: string;
}

interface ImportedPost {
  id: string;
  title: string;
  recipe: string;
  telegram_chat_id: string | null;
  original_channel_name: string | null;
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Stats
  const [totalCount, setTotalCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [ignoredCount, setIgnoredCount] = useState(0);
  
  // Status states
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<'idle' | 'importing' | 'completed'>('idle');
  const [importedPosts, setImportedPosts] = useState<ImportedPost[]>([]);
  
  // Student App Url configuration
  const [studentAppUrl, setStudentAppUrl] = useState('https://www.yeunauan.live');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    // Read the student web app URL configuration from process env
    let envUrl = process.env.NEXT_PUBLIC_STUDENT_APP_URL || '';
    if (envUrl.includes('=')) {
      envUrl = envUrl.split('=').pop() || '';
    }
    if (envUrl) {
      setStudentAppUrl(envUrl.trim().replace(/\/$/, ''));
    }
  }, []);

  const handleCopyLink = async (postId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(postId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFileExtension(droppedFile)) {
        setFile(droppedFile);
        processExcel(droppedFile);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFileExtension(selectedFile)) {
        setFile(selectedFile);
        processExcel(selectedFile);
      }
    }
  };

  const validateFileExtension = (file: File) => {
    setError('');
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx' && extension !== 'xls') {
      setError('Định dạng file không được hỗ trợ. Vui lòng tải lên file Excel (.xlsx hoặc .xls)');
      return false;
    }
    return true;
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Parse Excel file using SheetJS client-side
  const processExcel = (file: File) => {
    setLoading(true);
    setError('');
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        if (workbook.SheetNames.length === 0) {
          throw new Error('File Excel không có sheet nào.');
        }
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as ExcelRow[];
        
        if (jsonData.length === 0) {
          throw new Error('File Excel trống hoặc không có dòng dữ liệu hợp lệ.');
        }

        // Get headers from first row
        const sheetHeaders = Object.keys(jsonData[0]);
        setHeaders(sheetHeaders);
        
        // Validate required headers
        const requiredHeaders = ['normalized_title', 'recipe', 'match_status'];
        const missingHeaders = requiredHeaders.filter(h => !sheetHeaders.includes(h));
        
        if (missingHeaders.length > 0) {
          throw new Error(`File Excel thiếu các cột bắt buộc: ${missingHeaders.join(', ')}`);
        }

        // Process records
        setRows(jsonData);
        setTotalCount(jsonData.length);
        
        const matched = jsonData.filter(r => String(r.match_status || '').toUpperCase() === 'MATCHED').length;
        setMatchedCount(matched);
        setIgnoredCount(jsonData.length - matched);
        setImportProgress('idle');
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Lỗi khi đọc file Excel. Vui lòng kiểm tra lại cấu trúc file.');
        setFile(null);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Lỗi khi tải file. Vui lòng thử lại.');
      setLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  // Run Supabase Bulk Import
  const handleImport = async () => {
    const matchedRows = rows.filter(r => String(r.match_status || '').toUpperCase() === 'MATCHED');
    
    if (matchedRows.length === 0) {
      setError('Không có bài học nào có trạng thái "MATCHED" để import.');
      return;
    }

    setLoading(true);
    setError('');
    setImportProgress('importing');

    try {
      const response = await fetch('/api/posts/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ posts: matchedRows }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Lỗi khi import dữ liệu vào Supabase');
      }

      setImportedPosts(result.posts || []);
      setImportProgress('completed');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Đã có lỗi xảy ra trong quá trình import dữ liệu.');
      setImportProgress('idle');
    } finally {
      setLoading(false);
    }
  };

  // Generate result_links.xlsx client-side and trigger browser download
  const handleExportResultLinks = () => {
    if (importedPosts.length === 0) return;

    try {
      const exportData = importedPosts.map((post) => {
        const studentUrl = `${studentAppUrl}/post/${post.id}`;
        
        // Compute message text template according to YÊU CẦU 3
        const messageText = `📚 Bài học của lớp: ${post.title}\n\nBạn xem nội dung bài học tại đây:\n${studentUrl}`;
        
        return {
          'original_channel_name': post.original_channel_name || '',
          'normalized_title': post.title,
          'telegram_chat_id': post.telegram_chat_id || '',
          'post_id': post.id,
          'student_url': studentUrl,
          'message_text': messageText,
          'send_status': '' // Left empty for Telegram sender tool to fill
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Auto-fit column widths
      const maxLens = exportData.reduce((acc, row) => {
        Object.keys(row).forEach((key) => {
          const val = String((row as any)[key] || '');
          acc[key] = Math.max(acc[key] || 10, val.length);
        });
        return acc;
      }, {} as Record<string, number>);
      
      worksheet['!cols'] = Object.keys(maxLens).map(key => ({
        wch: Math.min(accLimit(key, maxLens[key]), 50)
      }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Result Links');
      
      // Write file
      XLSX.writeFile(workbook, 'result_links.xlsx');
    } catch (err) {
      console.error('Export failed:', err);
      alert('Không thể xuất file Excel kết quả. Vui lòng kiểm tra lại log.');
    }
  };

  // Column width helper limit
  const accLimit = (key: string, valLen: number) => {
    if (key === 'message_text') return 20; // Keep message text reasonably sized in Excel UI
    return valLen + 2;
  };

  // Reset import workflow
  const handleReset = () => {
    setFile(null);
    setRows([]);
    setHeaders([]);
    setTotalCount(0);
    setMatchedCount(0);
    setIgnoredCount(0);
    setError('');
    setImportProgress('idle');
    setImportedPosts([]);
  };

  // Filter preview table rows based on search
  const filteredRows = rows.filter(row => {
    const title = String(row.normalized_title || '').toLowerCase();
    const notes = String(row.notes || '').toLowerCase();
    const channel = String(row.original_channel_name || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return title.includes(query) || notes.includes(query) || channel.includes(query);
  });

  return (
    <main className={styles.container}>
      {/* Top Navigation */}
      <div className={styles.navHeader}>
        <Link href="/" className={styles.backButton}>
          <ArrowLeft size={16} /> Quay lại trang chủ
        </Link>
      </div>

      <div className={styles.mainHeader}>
        <h1>Import Bài Học Hàng Loạt</h1>
        <p>Nhập bài học từ file Excel (.xlsx), tạo liên kết truy cập bài học và chuẩn bị danh sách gửi Telegram.</p>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <AlertCircle className={styles.errorIcon} size={20} />
          <span>{error}</span>
        </div>
      )}

      {importProgress !== 'completed' ? (
        // STAGE 1: UPLOAD AND PREVIEW
        <div className={styles.cardLayout}>
          
          {/* Uploader Block */}
          {!file ? (
            <div 
              className={`${styles.dropZone} ${isDragActive ? styles.dropZoneActive : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className={styles.uploadIcon} size={48} />
              <h3>Kéo thả file Excel vào đây</h3>
              <p>Hoặc bấm vào nút bên dưới để chọn file từ máy tính (.xlsx hoặc .xls)</p>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".xlsx, .xls"
                className={styles.hiddenInput} 
              />
              
              <button 
                type="button" 
                onClick={triggerFileInput} 
                disabled={loading}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                {loading ? 'Đang đọc file...' : 'Chọn file Excel'}
              </button>
            </div>
          ) : (
            // Preview Stats & Action Header
            <div className={styles.previewContainer}>
              <div className={styles.statsSummaryGrid}>
                <div className={`${styles.statCard} glass`}>
                  <FileText className={styles.statCardIcon} size={24} />
                  <div>
                    <span className={styles.statLabel}>Tên file</span>
                    <h4 className={styles.statValName}>{file.name}</h4>
                  </div>
                </div>

                <div className={`${styles.statCard} glass`}>
                  <div className={`${styles.statCountBadge} ${styles.bgTotal}`}>
                    {totalCount}
                  </div>
                  <div>
                    <span className={styles.statLabel}>Tổng số dòng</span>
                    <h4 className={styles.statVal}>Bài viết</h4>
                  </div>
                </div>

                <div className={`${styles.statCard} glass`}>
                  <div className={`${styles.statCountBadge} ${styles.bgSuccess}`}>
                    {matchedCount}
                  </div>
                  <div>
                    <span className={styles.statLabel}>Sẵn sàng Import</span>
                    <h4 className={styles.statVal}>MATCHED</h4>
                  </div>
                </div>

                <div className={`${styles.statCard} glass`}>
                  <div className={`${styles.statCountBadge} ${styles.bgIgnore}`}>
                    {ignoredCount}
                  </div>
                  <div>
                    <span className={styles.statLabel}>Bỏ qua (Unmatched)</span>
                    <h4 className={styles.statVal}>Ignored</h4>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className={styles.actionBar}>
                <div className={styles.searchWrapper}>
                  <Search size={16} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Tìm kiếm tiêu đề, ghi chú, kênh gốc..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
                
                <div className={styles.actionButtons}>
                  <button 
                    type="button" 
                    onClick={handleReset} 
                    disabled={loading}
                    className={`${styles.btn} ${styles.btnSecondary}`}
                  >
                    Chọn file khác
                  </button>
                  <button 
                    type="button" 
                    onClick={handleImport} 
                    disabled={loading || matchedCount === 0 || importProgress === 'importing'}
                    className={`${styles.btn} ${styles.btnPrimary}`}
                  >
                    <Play size={16} /> 
                    {importProgress === 'importing' ? 'Đang Import...' : `Bắt đầu Import (${matchedCount} bài)`}
                  </button>
                </div>
              </div>

              {/* Preview Table */}
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: '60px', textAlign: 'center' }}>Dòng</th>
                      <th>Trạng thái</th>
                      <th>Tiêu đề học bài</th>
                      <th>Telegram Chat ID</th>
                      <th>Kênh gốc</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, index) => {
                      const isMatched = String(row.match_status || '').toUpperCase() === 'MATCHED';
                      return (
                        <tr key={index} className={!isMatched ? styles.rowIgnored : ''}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{index + 1}</td>
                          <td>
                            {isMatched ? (
                              <span className={`${styles.badge} ${styles.badgeMatched}`}>MATCHED</span>
                            ) : (
                              <span className={`${styles.badge} ${styles.badgeIgnored}`}>IGNORE</span>
                            )}
                          </td>
                          <td className={styles.titleCell}>{row.normalized_title || 'N/A'}</td>
                          <td><code>{row.telegram_chat_id || 'N/A'}</code></td>
                          <td style={{ color: 'var(--text-secondary)' }}>{row.original_channel_name || 'N/A'}</td>
                          <td className={styles.notesCell} title={row.notes}>{row.notes || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        // STAGE 2: IMPORT COMPLETED & EXPORT LINKS
        <div className={`${styles.successCard} glass animate-fade-in`}>
          <div className={styles.successHeader}>
            <div className={styles.successIconWrapper}>
              <CheckCircle2 size={48} className={styles.successCheckIcon} />
            </div>
            <h2>Import Hoàn Tất Thành Công!</h2>
            <p>Đã thêm mới thành công <strong>{importedPosts.length}</strong> bài học vào hệ thống lưu trữ Supabase.</p>
          </div>

          <div className={styles.successInfoBox}>
            <AlertTriangle className={styles.infoWarningIcon} size={20} />
            <p>
              <strong>Bước tiếp theo:</strong> Hãy tải file <code>result_links.xlsx</code> bên dưới, đặt vào thư mục dự án và chạy công cụ Python <code>npm run telegram:send</code> để gửi tin nhắn thông báo link bài học cho học viên.
            </p>
          </div>

          {/* Action Row */}
          <div className={styles.exportSection}>
            <button 
              type="button" 
              onClick={handleExportResultLinks}
              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`}
            >
              <Download size={20} /> Tải file result_links.xlsx
            </button>
            <button 
              type="button" 
              onClick={handleReset}
              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnLarge}`}
            >
              Tiếp tục Import file mới
            </button>
          </div>

          {/* Imported Posts List */}
          <h3 className={styles.importedListTitle}>Danh sách bài viết đã tạo:</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tên bài học</th>
                  <th>Telegram Chat ID</th>
                  <th>Post ID (Supabase)</th>
                  <th>Liên kết học viên (Student URL)</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {importedPosts.map((post) => {
                  const url = `${studentAppUrl}/post/${post.id}`;
                  return (
                    <tr key={post.id}>
                      <td className={styles.titleCell}>{post.title}</td>
                      <td><code>{post.telegram_chat_id || 'N/A'}</code></td>
                      <td><code style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{post.id}</code></td>
                      <td>
                        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                          {url}
                        </a>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleCopyLink(post.id, url)} 
                          className={styles.miniCopyBtn}
                          title="Sao chép link"
                        >
                          {copiedId === post.id ? <Check size={14} style={{ color: 'var(--accent-success)' }} /> : <Copy size={14} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

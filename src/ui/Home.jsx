import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { Upload } from 'lucide-react';

export function Home() {
    const navigate = useNavigate();
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleFile = async (file) => {
        if (!file || (!file.type.includes('epub') && !file.name.endsWith('.epub'))) {
            alert('Please select an EPUB file.');
            return;
        }

        setLoading(true);
        try {
            const buffer = await file.arrayBuffer();
            await bookStore.saveBook(buffer, { name: file.name, size: file.size });
            navigate('/player');
        } catch (err) {
            console.error(err);
            alert('Failed to load book');
        } finally {
            setLoading(false);
        }
    };

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, []);

    const onDragOver = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const onDragLeave = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const onBrowse = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    return (
        <div className="home-container" style={{ textAlign: 'center', marginTop: '4rem' }}>
            <h2>Your Library</h2>
            <div
                className="drop-zone"
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => document.getElementById('file-input').click()}
                style={{
                    border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--text-primary)'}`,
                    borderColor: isDragging ? 'var(--accent-color)' : 'rgba(128,128,128,0.5)',
                    borderRadius: '8px',
                    padding: '3rem',
                    margin: '2rem auto',
                    maxWidth: '500px',
                    cursor: 'pointer',
                    background: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    transition: 'all 0.2s'
                }}
            >
                <Upload size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>{loading ? 'Loading book...' : 'Drag & Drop EPUB files here'}</p>
                <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>or click to browse</p>
                <input
                    type="file"
                    id="file-input"
                    accept=".epub"
                    style={{ display: 'none' }}
                    onChange={onBrowse}
                />
            </div>
        </div>
    );
}

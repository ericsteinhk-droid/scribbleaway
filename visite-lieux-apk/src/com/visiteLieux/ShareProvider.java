package com.visiteLieux;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/**
 * Minimal FileProvider — expose les fichiers locaux via un URI content://
 * sans dépendance AndroidX. Requis sur Android 7+ (API 24+) pour partager
 * des fichiers via Intent.ACTION_SEND.
 */
public class ShareProvider extends ContentProvider {

    public static final String AUTHORITY = "com.visiteLieux.share";

    public static Uri uriForFile(File file) {
        return new Uri.Builder()
            .scheme("content")
            .authority(AUTHORITY)
            .encodedPath(Uri.encode(file.getAbsolutePath(), "/"))
            .build();
    }

    @Override
    public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode)
            throws FileNotFoundException {
        File file = new File(uri.getPath());
        if (!file.exists()) throw new FileNotFoundException(uri.getPath());
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        String path = uri.getPath();
        if (path == null) return "application/octet-stream";
        if (path.endsWith(".pdf"))  return "application/pdf";
        if (path.endsWith(".xlsx")) return
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        return "application/octet-stream";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        File file = new File(uri.getPath());
        if (projection == null) {
            projection = new String[]{ OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        }
        MatrixCursor cursor = new MatrixCursor(projection);
        Object[] row = new Object[projection.length];
        for (int i = 0; i < projection.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(projection[i])) row[i] = file.getName();
            if (OpenableColumns.SIZE.equals(projection[i]))         row[i] = file.length();
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override public Uri    insert(Uri u, ContentValues v)                             { return null; }
    @Override public int    delete(Uri u, String s, String[] a)                        { return 0; }
    @Override public int    update(Uri u, ContentValues v, String s, String[] a)       { return 0; }
}

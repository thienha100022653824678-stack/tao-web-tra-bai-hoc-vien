import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy tệp tải lên' },
        { status: 400 }
      );
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      // Create a unique filename using random bytes + sanitized original name
      const fileExt = file.name.split('.').pop();
      const sanitizedOriginalName = file.name
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 30);
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const filename = `${uniqueId}_${sanitizedOriginalName}.${fileExt}`;

      // Convert file stream to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to Supabase Storage
      const { data, error } = await supabaseAdmin.storage
        .from('post-images')
        .upload(filename, buffer, {
          contentType: file.type,
          upsert: true,
        });

      if (error) {
        console.error('Supabase upload error:', error);
        return NextResponse.json(
          { success: false, error: `Lỗi tải ảnh lên Supabase: ${error.message}` },
          { status: 500 }
        );
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('post-images')
        .getPublicUrl(filename);

      if (urlData?.publicUrl) {
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    return NextResponse.json({ success: true, urls: uploadedUrls });
  } catch (err: any) {
    console.error('Upload handler error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
export const maxDuration = 60; // Set timeout limit for file uploads to 60s if needed on Vercel

package kr.hyeonjang.domyeon;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.core.content.IntentCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 다른 앱의 '공유'(또는 '다른 앱으로 열기')로 받은 글·사진·3D 모델 파일을 웹 화면에 넘긴다.
 * 쇼핑 앱에서 제품을 공유하면 이름·링크(·사진)가 '사물 등록' 창에 채워진다.
 * 웹 쪽: Capacitor.Plugins.ShareIn.consume() (앱을 켤 때 받은 것), 'share' 이벤트 (켜져 있을 때 받은 것).
 * 넘기는 값: { text, image(data URL), file(data URL), name, mime, tooBig }
 */
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {
    private static final int MAX_BYTES = 24 * 1024 * 1024;
    private Intent first = null;

    @Override
    public void load() {
        Intent intent = getActivity() != null ? getActivity().getIntent() : null;
        // 최근 앱 목록에서 다시 켠 것은 예전 공유를 또 받지 않게 건너뜀
        if (intent != null && (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0 && wanted(intent)) first = intent;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (!wanted(intent)) return;
        final Intent got = intent;
        getBridge().execute(() -> {
            JSObject data = read(got);
            if (data != null) notifyListeners("share", data, true);
        });
    }

    /** 앱을 켤 때 받은 것 (한 번만 돌려줌, 없으면 빈 값) */
    @PluginMethod
    public void consume(PluginCall call) {
        Intent intent = first;
        first = null;
        JSObject data = intent != null ? read(intent) : null;
        call.resolve(data != null ? data : new JSObject());
    }

    private static boolean wanted(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        return Intent.ACTION_SEND.equals(action) || (Intent.ACTION_VIEW.equals(action) && intent.getData() != null && "content".equals(intent.getData().getScheme()));
    }

    private JSObject read(Intent intent) {
        try {
            JSObject out = new JSObject();
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            StringBuilder sb = new StringBuilder();
            if (subject != null && !subject.trim().isEmpty() && (text == null || !text.contains(subject.trim()))) sb.append(subject.trim()).append('\n');
            if (text != null) sb.append(text.trim());
            if (sb.length() > 0) out.put("text", sb.toString());

            Uri uri = Intent.ACTION_VIEW.equals(intent.getAction()) ? intent.getData() : IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            if (uri != null) {
                ContentResolver cr = getContext().getContentResolver();
                String mime = cr.getType(uri);
                if (mime == null) mime = intent.getType();
                if (mime == null) mime = "application/octet-stream";
                String name = displayName(cr, uri);
                if (name != null) out.put("name", name);
                out.put("mime", mime);
                byte[] bytes = readAll(cr, uri);
                if (bytes == null) out.put("tooBig", true);
                else {
                    String url = "data:" + mime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
                    out.put(mime.startsWith("image/") ? "image" : "file", url);
                }
            }
            return out.length() > 0 ? out : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String displayName(ContentResolver cr, Uri uri) {
        try (Cursor c = cr.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception e) {
            // 이름을 못 얻으면 주소의 끝부분
        }
        return uri.getLastPathSegment();
    }

    /** 통째로 읽음. 너무 크면 null */
    private static byte[] readAll(ContentResolver cr, Uri uri) throws Exception {
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) return new byte[0];
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (out.size() + n > MAX_BYTES) return null;
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }
}

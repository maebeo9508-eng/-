package kr.hyeonjang.domyeon;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ActivityInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 화면 돌리기: 도면을 손으로 만지며 쓰는 앱이라, 휴대폰을 눕히거나 기울일 때 화면이 저절로 돌아가면 일을 방해한다.
 * 휴대폰(짧은 쪽 600dp 미만)은 세로로 고정하는 것이 기본이고, 태블릿은 기기 설정을 따른다.
 * 설정 → 화면 → ‘화면 돌리기’에서 바꾸면 웹 쪽이 Capacitor.Plugins.Screen.rotation({ lock }) 으로 알려 주고,
 * 그 값은 기기에 적어 두었다가 다음에 켤 때 웹 화면이 뜨기 전에 먼저 적용한다.
 */
@CapacitorPlugin(name = "Screen")
public class ScreenPlugin extends Plugin {
    private static final String PREFS = "hjdm_screen";
    private static final String KEY = "rotateLock"; // 1: 세로 고정, 0: 기기 따라, 없음: 기기 크기에 따라

    static boolean isPhone(Context c) {
        return c.getResources().getConfiguration().smallestScreenWidthDp < 600;
    }

    /** 적어 둔 값(없으면 휴대폰은 고정)에 따라 지금 화면에 적용 */
    static void apply(Activity a) {
        int v = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY, -1);
        boolean lock = v == 1 || (v == -1 && isPhone(a));
        a.setRequestedOrientation(lock ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }

    @PluginMethod
    public void rotation(PluginCall call) {
        final Activity a = getActivity();
        final Boolean lock = call.getBoolean("lock");
        if (a == null || lock == null) {
            call.reject("lock(true/false)이 필요합니다");
            return;
        }
        a.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY, lock ? 1 : 0).apply();
        a.runOnUiThread(() -> {
            apply(a);
            JSObject r = new JSObject();
            r.put("lock", lock);
            r.put("phone", isPhone(a));
            call.resolve(r);
        });
    }
}

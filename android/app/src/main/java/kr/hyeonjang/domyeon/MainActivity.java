package kr.hyeonjang.domyeon;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInPlugin.class); // 다른 앱의 '공유'로 받은 글·사진·모델 파일 → 사물 등록
        registerPlugin(ScreenPlugin.class);  // 화면 돌리기: 휴대폰은 세로 고정이 기본 (설정에서 바꿈)
        super.onCreate(savedInstanceState);
        ScreenPlugin.apply(this);            // 웹 화면이 뜨기 전에 먼저 적용 (켜자마자 돌아가지 않게)
    }
}

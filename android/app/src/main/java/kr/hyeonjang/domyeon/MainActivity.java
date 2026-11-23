package kr.hyeonjang.domyeon;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInPlugin.class); // 다른 앱의 '공유'로 받은 글·사진·모델 파일 → 사물 등록
        super.onCreate(savedInstanceState);
    }
}

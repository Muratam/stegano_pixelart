<template>
  <section class="panel">
    <div class="panel-head">
      <h2>VPiet について</h2>
    </div>
    <div class="prose">
      <p>
        ドット絵ステガノの亜種です。ドット絵の見た目をなるべく保ったまま、<strong>Piet のプログラムとして実行すると指定した文字列を出力する</strong>画像に作り変えます。
        情報を隠すのではなく「実行すると出る」ものです。処理はすべてブラウザの中で行います。
      </p>

      <h3>Piet とは</h3>
      <ul>
        <li>
          <a href="https://www.dangermouse.net/esoteric/piet.html">Piet</a> は画像そのものがプログラムになる難解プログラミング言語です。色は 20 色（色相 6 × 明るさ 3 と白・黒）で、同じ色のつながった領域（ブロック）を順にたどります。
        </li>
        <li>隣のブロックに移るときの色相と明るさの変化で命令（push・add・dup・outc など）が決まります。push は出たブロックの大きさ（コーデルの数）を積みます。</li>
        <li>白は素通り、黒と画像の端は壁です。8 通りの向きを試しても進めなければ終了します。</li>
      </ul>

      <h3>しくみ</h3>
      <ul>
        <li>文字列を小さい数の push と dup・mul・add・sub の命令列（PASM、Piet のアセンブリ）にします。</li>
        <li>左上から順に、命令を実行する色・ブロックを広げる色・白・黒を置いていく最良優先のビームサーチで、元のドット絵（Piet の 20 色に寄せたもの）との色差（CIEDE2000）の合計が小さい画像を探します。命令の途中で余分なスタック操作（pointer・switch など）を挟み、向きを変えて画像の中を回ることもできます。</li>
        <li>最後まで実行し終えたら、まだ使っていない所を元の色で埋めます。作った画像はこの画面で実行して、文字列が出ることを確かめてから表示します。</li>
      </ul>

      <h3>出典</h3>
      <ul>
        <li>vpiet: <a href="https://github.com/Muratam/vpiet">github.com/Muratam/vpiet</a></li>
        <li>解説: <a href="https://chy72.hatenablog.com/entry/2019/09/11/180418">chy72.hatenablog.com（2019-09-11）</a></li>
        <li>りんご・土星のサンプルは vpiet の test/src/png のもの、ハート・家・木はこのリポジトリで作ったものです。</li>
      </ul>
    </div>
  </section>
</template>

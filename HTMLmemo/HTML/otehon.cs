using UnityEngine;
using System.IO; // これを忘れずに追加してください

public class otehon : MonoBehaviour
{
    void Start()
    {
        // 保存先のファイルパスを設定
        // 例: Assetsフォルダ内に "sample.tex" として保存
        string filePath = Application.dataPath + "/sample.tex";

        // 追記する文字列
        string textToAppend = "これは追記されるテキストです。\n";

        // ファイルに追記（ファイルが存在しない場合は自動で作成されます）
        File.AppendAllText(filePath, textToAppend);

        Debug.Log("ファイルに追記しました: " + filePath);
    }
}
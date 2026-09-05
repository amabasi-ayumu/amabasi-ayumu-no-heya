using System.Collections.Generic;
using UnityEngine;

// アイテムの情報を定義するクラス
// [System.Serializable] をつけると、UnityのInspector上から中身を確認・編集できるようになります
[System.Serializable]
public class Item
{
    public string itemName;  // アイテム名
    public int price;        // 価格や個数などの数値データ
}

public class ItemLogger : MonoBehaviour
{
    // アイテムを格納するリストを作成
    public List<Item> itemList = new List<Item>();

    void Start()
    {
        // プログラムからリストにアイテムを追加する場合の例
        itemList.Add(new Item { itemName = "ポーション", price = 100 });
        itemList.Add(new Item { itemName = "毒消し草", price = 50 });
        itemList.Add(new Item { itemName = "鉄の剣", price = 1500 });

        // ログ出力処理を呼び出す
        OutputItemLog();
    }

    void OutputItemLog()
    {
        Debug.Log("=== アイテムリストを出力します ===");

        // リストの中身を1つずつ取り出してログに出力する
        for (int i = 0; i < itemList.Count; i++)
        {
            Item currentItem = itemList[i];
            Debug.Log($"インデックス[{i}] : 名前 = {currentItem.itemName}, 価格 = {currentItem.price}");
        }

           }
}
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class enemyscript : MonoBehaviour
{
    public bool attack = false;
    public bool idle = false;
    public bool carpet1 = false;
    public bool carpet2 = false;
    public bool carpet3 = false;
    public bool carpet4 = false;
    Rigidbody juuryoku;
    Collider coll;
    [SerializeField]
    GameObject[] carpetobject; 
    Collider[] carpet;
    int number;
    public int speed;
    Vector3 enemypos;
    delete delete;
    // Start is called before the first frame update
    void Start()
    {
        juuryoku = GetComponent<Rigidbody>();
        enemypos = transform.position;
        if(-21 < enemypos.x && enemypos.x < -19)
        {
            number = 0;
            delete = GameObject.Find("delete1").GetComponent<delete>();
        }
        if (-6 < enemypos.x && enemypos.x < -4)
        {
            number = 1;
            delete = GameObject.Find("delete2").GetComponent<delete>();
        }
        if (9 < enemypos.x && enemypos.x < 11)
        {
            number = 2;
            delete = GameObject.Find("delete3").GetComponent<delete>();
        }
        if (24 < enemypos.x && enemypos.x < 26)
        {
            number = 3;
            delete = GameObject.Find("delete4").GetComponent<delete>();
        }
    }
    private void OnTriggerStay(Collider collision)
    {
        if (collision.gameObject.CompareTag("Delete"))
        {
            attack = true;
        }
    }
    private void OnTriggerEnter(Collider collision)
    {
        if (collision.gameObject.CompareTag("enemy"))
        {
            Destroy(this.gameObject);
        }
        if (collision.gameObject.CompareTag("Delete"))
        {
            delete.carpet = true;
            Debug.Log(delete.carpet);
        }
    }
    void OnParticleCollision(GameObject other)
    {
        Destroy(this.gameObject);
    }
    // Update is called once per frame
    void Update()
    {
        if(attack == false && idle == false){
            juuryoku.MovePosition(transform.position + transform.forward * speed * Time.deltaTime);
        }
        if (delete.carpet == true)
        {
            idle = true;
        }
        else
        {
            idle = false;
        }
    }
}

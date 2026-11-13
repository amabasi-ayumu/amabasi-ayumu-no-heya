using Unity.VisualScripting;
using UnityEngine;
using UnityEngine.UIElements;

public class delete : MonoBehaviour
{
    int number;
    public bool carpet = false;
    // Start is called once before the first execution of Update after the MonoBehaviour is created
    void Start()
    {
        if (-21 < transform.position.x && transform.position.x < -19)
{
            number = 0;
        }
        if (-6 < transform.position.x && transform.position.x < -4)
{
            number = 1;
        }
        if (9 < transform.position.x && transform.position.x < 11)
{
            number = 2;
        }
        if (24 < transform.position.x && transform.position.x < 26)
{
            number = 3;
        }
    }

    // Update is called once per frame
    void Update()
    {
        
    }
    private void OnTriggerEnter(Collider collision)
    {
        if (collision.gameObject.CompareTag("enemy"))
        {
            if (number == 0)
            {

            }
            else if (number == 1)
            {

            }
            else if (number == 2)
            {

            }
            else
            {

            }
        }
    }
}

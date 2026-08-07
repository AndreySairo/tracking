using UnityEngine;

public class CarController : MonoBehaviour
{
    // Эти переменные вы сможете менять в инспекторе Unity
    public float speed = 10f;        // скорость движения
    public float turnSpeed = 100f;   // скорость поворота

    private Rigidbody rb;            // ссылка на компонент Rigidbody

    void Start()
    {
        // Получаем компонент Rigidbody, прикреплённый к машинке
        rb = GetComponent<Rigidbody>();
    }

    void FixedUpdate() // вызывается каждый физический кадр (лучше для движения)
    {
        // Считываем нажатия с клавиатуры
        float moveVertical = Input.GetAxis("Vertical");   // W / S или стрелки вверх/вниз
        float moveHorizontal = Input.GetAxis("Horizontal"); // A / D или стрелки влево/вправо

        // Движение вперёд/назад (в локальном направлении машинки)
        Vector3 movement = transform.forward * moveVertical * speed * Time.deltaTime;
        rb.MovePosition(rb.position + movement);

        // Поворот (вокруг вертикальной оси Y)
        float turn = moveHorizontal * turnSpeed * Time.deltaTime;
        Quaternion turnRotation = Quaternion.Euler(0f, turn, 0f);
        rb.MoveRotation(rb.rotation * turnRotation);
    }
}
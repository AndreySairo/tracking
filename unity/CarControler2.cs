using UnityEngine;

public class CarPhysics : MonoBehaviour
{
    public float motorPower = 1500f;
    public float maxSpeed = 25f;
    public float steerPower = 200f;
    public float drag = 0.98f;
    
    private Rigidbody rb;
    private float currentSpeed;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
        rb.centerOfMass = new Vector3(0, -0.5f, 0); // Опускаем центр масс для устойчивости
    }

    void FixedUpdate() // ВСЮ ФИЗИКУ пишем в FixedUpdate!
    {
        float vertical = Input.GetAxis("Vertical");
        float horizontal = Input.GetAxis("Horizontal");

        // --- ДВИГАТЕЛЬ ---
        Vector3 forwardForce = transform.forward * vertical * motorPower * Time.fixedDeltaTime;
        rb.AddForce(forwardForce);
        
        // Ограничение скорости
        if (rb.velocity.magnitude > maxSpeed)
        {
            rb.velocity = rb.velocity.normalized * maxSpeed;
        }

        // --- ПОВОРОТ (от задней оси) ---
        // Получаем точку задней оси
        Vector3 backWheelPos = transform.position - transform.forward * 1.5f;
        
        // Сила, тянущая машину в сторону поворота
        float turnForce = horizontal * steerPower * Time.fixedDeltaTime;
        Vector3 turnDirection = transform.right * turnForce;
        
        // Прикладываем силу к задней оси (она разворачивает машину)
        rb.AddForceAtPosition(turnDirection, backWheelPos, ForceMode.Force);

        // --- ТРЕНИЕ (чтобы не улетела в бесконечность) ---
        rb.velocity *= drag;
        
        // --- ЕСТЕСТВЕННЫЙ НАКЛОН В ПОВОРОТЕ (как в реальности) ---
        float tiltAngle = -horizontal * 15f * (rb.velocity.magnitude / maxSpeed);
        Quaternion targetTilt = Quaternion.Euler(0, 0, tiltAngle);
        transform.rotation = Quaternion.Lerp(transform.rotation, targetTilt, Time.fixedDeltaTime * 3f);
    }
}
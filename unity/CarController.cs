using UnityEngine;

public class CarController : MonoBehaviour
{
    [Header("Движение")]
    public float motorForce = 10f;      // Сила тяги
    public float maxSpeed = 20f;        // Максимальная скорость
    
    [Header("Поворот")]
    public float steerAngle = 30f;      // Максимальный угол поворота колес
    public float turnSpeed = 5f;        // Скорость самого поворота машины
    
    [Header("Колеса (визуал)")]
    public Transform frontLeftWheel;
    public Transform frontRightWheel;
    public Transform rearLeftWheel;
    public Transform rearRightWheel;
    
    private float currentSpeed = 0f;
    private float currentTurnAngle = 0f;

    void Update()
    {
        // --- 1. ВВОД ---
        float vertical = Input.GetAxis("Vertical");   // W / S
        float horizontal = Input.GetAxis("Horizontal"); // A / D

        // --- 2. РАЗГОН ---
        // Увеличиваем/уменьшаем скорость плавно
        currentSpeed += vertical * motorForce * Time.deltaTime;
        // Ограничиваем скорость (максимум вперед и назад)
        currentSpeed = Mathf.Clamp(currentSpeed, -maxSpeed * 0.5f, maxSpeed);

        // Если не нажимаем газ — машина останавливается (трение)
        if (Mathf.Abs(vertical) < 0.1f)
        {
            currentSpeed = Mathf.Lerp(currentSpeed, 0, Time.deltaTime * 3f);
        }

        // --- 3. ПОВОРОТ (самое важное!) ---
        // Машина поворачивает только когда едет!
        if (Mathf.Abs(currentSpeed) > 0.5f)
        {
            // Рассчитываем угол поворота руля
            float targetTurn = horizontal * steerAngle;
            // Плавно крутим руль
            currentTurnAngle = Mathf.Lerp(currentTurnAngle, targetTurn, Time.deltaTime * 8f);

            // --- ГЛАВНЫЙ СЕКРЕТ: Поворачиваем машину вокруг задней оси ---
            // Смещаем точку поворота на 1.5 метра назад (зависит от размера машины)
            Vector3 pivotPoint = transform.position - transform.forward * 1.5f;
            
            // Вычисляем радиус поворота
            float turnRadius = 3f; // Чем меньше число, тем резче поворот
            float rotationAmount = (currentSpeed / turnRadius) * Time.deltaTime;
            
            // Поворачиваем машину вокруг задней оси
            transform.RotateAround(pivotPoint, Vector3.up, -currentTurnAngle * rotationAmount * 1.2f);
        }
        else
        {
            // Если стоим, руль возвращается в ноль
            currentTurnAngle = Mathf.Lerp(currentTurnAngle, 0, Time.deltaTime * 5f);
        }

        // --- 4. ДВИЖЕНИЕ ВПЕРЕД ---
        transform.Translate(Vector3.forward * currentSpeed * Time.deltaTime, Space.Self);

        // --- 5. ВИЗУАЛ КОЛЕС ---
        AnimateWheels(horizontal);
    }

    void AnimateWheels(float horizontalInput)
    {
        // Поворачиваем передние колеса (только визуально)
        float wheelRot = Mathf.Lerp(0, horizontalInput * steerAngle, 0.7f);
        if (frontLeftWheel != null) frontLeftWheel.localRotation = Quaternion.Euler(0, wheelRot, 0);
        if (frontRightWheel != null) frontRightWheel.localRotation = Quaternion.Euler(0, wheelRot, 0);

        // Крутим колеса (чтобы они вращались при езде)
        float wheelSpin = currentSpeed * 100f * Time.deltaTime;
        frontLeftWheel.Rotate(wheelSpin, 0, 0);
        frontRightWheel.Rotate(wheelSpin, 0, 0);
        rearLeftWheel.Rotate(wheelSpin, 0, 0);
        rearRightWheel.Rotate(wheelSpin, 0, 0);
    }
}
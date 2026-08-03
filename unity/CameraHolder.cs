using UnityEngine;

public class ThirdPersonCamera : MonoBehaviour
{
    public Transform target;        // Ссылка на машину
    public float distance = 6f;     // Дистанция от машины
    public float height = 3f;       // Высота над машиной
    public float smoothness = 5f;   // Плавность следования

    private Vector3 offset;

    void Start()
    {
        // Вычисляем смещение при старте
        offset = new Vector3(0, height, -distance);
    }

    void LateUpdate() // LateUpdate выполняется после движения, чтобы камера не дергалась
    {
        if (target == null) return;

        // Точка, куда должна смотреть камера (чуть выше машины)
        Vector3 lookAtTarget = target.position + Vector3.up * 1.5f;
        
        // Желаемая позиция камеры
        Vector3 desiredPosition = target.position + target.TransformDirection(offset);
        
        // Плавно перемещаем камеру
        transform.position = Vector3.Lerp(transform.position, desiredPosition, Time.deltaTime * smoothness);
        
        // Поворачиваем камеру, чтобы смотреть на машину
        transform.LookAt(lookAtTarget);
    }
}